import { createClient } from "@supabase/supabase-js";
import { quotaFor, readJsonLimited } from "../_shared/limits.ts";
import { chatDailyLimit, freeChatLimit, revenueCatConfig, verifyRevenueCatPlan } from "../_shared/subscriptions.ts";

const env = (key: string) => Deno.env.get(key) ?? "";
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (request.method !== "POST") return json({ error: "Use POST." }, 405);

  const url = env("SUPABASE_URL");
  const authorization = request.headers.get("Authorization") ?? "";
  const authClient = createClient(url, env("SUPABASE_ANON_KEY"), {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: auth, error: authError } = await authClient.auth.getUser();
  if (authError || !auth.user) return json({ error: "Please sign in again." }, 401);

  const parsed = await readJsonLimited(request, 16_384);
  if (!parsed.ok || !parsed.value || typeof parsed.value !== "object" || Array.isArray(parsed.value)) {
    return json({ error: "Bad request." }, 400);
  }
  const body = parsed.value as Record<string, unknown>;
  if (body.action !== "status") return json({ error: "Unknown action." }, 400);

  const secretKey = env("REVENUECAT_SECRET_API_KEY");
  let verification: Awaited<ReturnType<typeof verifyRevenueCatPlan>> = { configured: false, verified: false, plan: "free", expiresAt: null };
  if (secretKey) {
    try {
      verification = await verifyRevenueCatPlan(auth.user.id, secretKey, revenueCatConfig(env));
    } catch (error) {
      // Fail closed: API failures never create or preserve a client-side premium entitlement.
      console.error("RevenueCat status verification failed", String(error));
      verification = { configured: true, verified: false, plan: "free", expiresAt: null };
    }
  }

  const serviceRoleKey = env("SUPABASE_SERVICE_ROLE_KEY");
  if (!serviceRoleKey) return json({ error: "Subscription usage limits are not configured on the server." }, 500);
  const serviceClient = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const limit = freeChatLimit(env);
  let freeChatsRemaining: number | null = null;
  let cooldownUntil: string | null = null;

  if (verification.plan === "free") {
    const { data, error } = await serviceClient.rpc("get_free_chat_status", {
      p_user_id: auth.user.id,
      p_free_limit: limit,
    });
    if (error || !data) {
      console.error("get_free_chat_status failed", error?.message);
      return json({ error: "Usage limits are not set up on the server yet. Run the latest supabase/schema.sql." }, 500);
    }
    freeChatsRemaining = Number(data.remaining ?? 0);
    cooldownUntil = typeof data.cooldown_until === "string" ? data.cooldown_until : null;
  }

  return json({
    plan: verification.plan,
    expiresAt: verification.expiresAt,
    verified: verification.verified,
    verificationReady: verification.configured && verification.verified,
    freeChatLimit: limit,
    plusChatPerDay: chatDailyLimit("plus", env, quotaFor("chat", env).perDay),
    proChatPerDay: chatDailyLimit("pro", env, quotaFor("chat", env).perDay),
    freeChatsRemaining,
    cooldownUntil,
  });
});
