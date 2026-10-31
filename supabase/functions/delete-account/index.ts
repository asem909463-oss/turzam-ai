// Turzam AI: permanent account deletion.
//
// This is the ONLY code that uses the Supabase service-role key, and it is kept in its own function
// on purpose: the chat function never sees it. The key is injected by Supabase automatically
// (SUPABASE_SERVICE_ROLE_KEY); you do not add it anywhere.
//
// Safety checks, in order:
//   1. The caller must be signed in (verify_jwt + getUser).
//   2. They must retype their password (verified against Supabase Auth) and the word DELETE,
//      so a stolen or left-open session cannot erase an account.
//   3. At most 3 attempts per minute and 5 per day (consume_quota).
//   4. All of the user's files are removed first; if that fails nothing else is deleted, so they can retry.
//   5. The auth user is deleted last. Database rows (profile, chats, messages, memories, folders, usage)
//      are removed by "on delete cascade" in schema.sql.

import { createClient } from "npm:@supabase/supabase-js@2";
import { quotaFor } from "../_shared/limits.ts";

const BUCKET = "attachments";
const env = (k: string) => Deno.env.get(k) ?? "";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

// deno-lint-ignore no-explicit-any
async function removeFolder(admin: any, prefix: string): Promise<void> {
  // Files live at <user id>/<chat id>/<file>. List a page, delete what is in it, repeat until empty.
  // (Always re-reading the first page is simpler and safer than paging past files we just removed.)
  for (let round = 0; round < 500; round++) {
    const { data, error } = await admin.storage.from(BUCKET).list(prefix, { limit: 100, offset: 0 });
    if (error) throw new Error(error.message);
    if (!data?.length) return;
    const files: string[] = [];
    for (const item of data) {
      if (item.id === null) await removeFolder(admin, `${prefix}/${item.name}`);
      else files.push(`${prefix}/${item.name}`);
    }
    if (files.length) {
      const { error: rmError } = await admin.storage.from(BUCKET).remove(files);
      if (rmError) throw new Error(rmError.message);
    }
  }
  throw new Error("too many files to remove in one go");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Use POST." }, 405);

  const url = env("SUPABASE_URL");
  const anon = env("SUPABASE_ANON_KEY");
  const service = env("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anon || !service) return json({ error: "The server is not set up for account deletion." }, 500);

  const userClient = createClient(url, anon, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: auth, error: authError } = await userClient.auth.getUser();
  if (authError || !auth.user || !auth.user.email) return json({ error: "Please sign in again." }, 401);
  const user = auth.user;

  // deno-lint-ignore no-explicit-any
  let body: any;
  try {
    body = await req.json();
  } catch (_) {
    return json({ error: "Bad request." }, 400);
  }
  const password = typeof body?.password === "string" ? body.password : "";
  if (body?.confirm !== "DELETE" || !password || password.length > 200) {
    return json({ error: "Type DELETE and your password to confirm." }, 400);
  }

  const q = quotaFor("delete", env);
  const { data: quota, error: quotaError } = await userClient.rpc("consume_quota", {
    p_kind: "delete",
    p_per_minute: q.perMinute,
    p_per_day: q.perDay,
  });
  if (quotaError || !quota) return json({ error: "Usage limits are not set up. Run the latest supabase/schema.sql." }, 500);
  if (quota.ok !== true) return json({ error: "Too many attempts. Please wait a few minutes." }, 429);

  // Check the password with a throwaway client so the caller's own session is not touched.
  const verifier = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error: pwError } = await verifier.auth.signInWithPassword({ email: user.email, password });
  if (pwError) return json({ error: "That password is not correct." }, 403);

  const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
  try {
    await removeFolder(admin, user.id);
  } catch (e) {
    console.error("account files removal failed", String(e));
    return json({ error: "Could not remove your files. Nothing else was deleted. Please try again." }, 500);
  }
  const { error: delError } = await admin.auth.admin.deleteUser(user.id);
  if (delError) {
    console.error("deleteUser failed", delError.message);
    return json({ error: "Could not delete the account. Please try again." }, 500);
  }
  return json({ deleted: true });
});
