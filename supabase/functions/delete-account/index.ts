// Turzam AI: permanent account deletion.
//
// The service-role key is used only for the quota RPC and final account/storage deletion.
// The key is injected by Supabase automatically (SUPABASE_SERVICE_ROLE_KEY); never add it to the app.
//
// Safety checks, in order:
//   1. The caller must be signed in (verify_jwt + getUser).
//   2. They must retype their password (verified against Supabase Auth) and the word DELETE,
//      so a stolen or left-open session cannot erase an account.
//   3. At most 3 attempts per minute and 5 per day (consume_quota).
//   4. A service-only recovery row is written before cleanup. Storage deletion is idempotent and can be retried.
//   5. The auth user is deleted last. Database rows are removed by cascade; on failure the account stays active.

import { createClient } from "@supabase/supabase-js";
import { globalPerDay, quotaFor, readJsonLimited } from "../_shared/limits.ts";

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

// Recovery rows contain only a stage and a fixed error code, never passwords or provider credentials.
// deno-lint-ignore no-explicit-any
async function updateDeletionJob(admin: any, userId: string, stage: "storage" | "database", lastError: string | null) {
  const { error } = await admin.from("account_deletion_jobs").update({
    stage,
    last_error: lastError,
    updated_at: new Date().toISOString(),
  }).eq("user_id", userId);
  if (error) throw error;
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
  const email = auth.user?.email;
  if (authError || !auth.user || !email) return json({ error: "Please sign in again." }, 401);
  const user = auth.user;
  const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });

  const maxBodyBytes = 16_384;
  const declared = req.headers.get("content-length");
  if (declared && /^\d+$/.test(declared) && Number(declared) > maxBodyBytes) {
    return json({ error: "That request is too large." }, 413);
  }
  const parsed = await readJsonLimited(req, maxBodyBytes);
  if (!parsed.ok) {
    return parsed.error === "too_large"
      ? json({ error: "That request is too large." }, 413)
      : json({ error: "Bad request." }, 400);
  }
  // deno-lint-ignore no-explicit-any
  const body: any = parsed.value;
  if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "Bad request." }, 400);
  const password = typeof body?.password === "string" ? body.password : "";
  if (body?.confirm !== "DELETE" || !password || password.length > 200) {
    return json({ error: "Type DELETE and your password to confirm." }, 400);
  }

  const q = quotaFor("delete", env);
  const { data: quota, error: quotaError } = await admin.rpc("consume_quota", {
    p_user_id: user.id,
    p_kind: "delete",
    p_per_minute: q.perMinute,
    p_per_day: q.perDay,
    p_global_per_day: globalPerDay("delete", env),
  });
  if (quotaError || !quota) return json({ error: "Usage limits are not set up. Run the latest supabase/schema.sql." }, 500);
  if (quota.ok !== true) return json({ error: "Too many attempts. Please wait a few minutes." }, 429);

  // Check the password with a throwaway client so the caller's own session is not touched.
  const verifier = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error: pwError } = await verifier.auth.signInWithPassword({ email, password });
  if (pwError) return json({ error: "That password is not correct." }, 403);

  // Fail closed before deleting anything if the recovery record cannot be persisted.
  const { error: jobError } = await admin.from("account_deletion_jobs").upsert({
    user_id: user.id,
    stage: "storage",
    last_error: null,
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id" });
  if (jobError) {
    console.error("account deletion recovery record failed", jobError.message);
    return json({ error: "Deletion could not be started safely. Your account is unchanged; please try again later." }, 500);
  }

  try {
    await removeFolder(admin, user.id);
  } catch (e) {
    console.error("account files removal failed", String(e));
    await updateDeletionJob(admin, user.id, "storage", "storage_cleanup_failed").catch((jobUpdateError) => {
      console.error("account deletion recovery update failed", String(jobUpdateError));
    });
    return json({ error: "Some files could not be removed. Your account is still active; safely retry deletion from Settings. Files already removed will be skipped." }, 500);
  }

  try {
    await updateDeletionJob(admin, user.id, "database", null);
  } catch (e) {
    console.error("account deletion stage update failed", String(e));
    return json({ error: "Files are cleaned, but account deletion has not started. Your account is still active; retry from Settings." }, 500);
  }

  const { error: delError } = await admin.auth.admin.deleteUser(user.id);
  if (delError) {
    console.error("deleteUser failed", delError.message);
    await updateDeletionJob(admin, user.id, "database", "auth_delete_failed").catch((jobUpdateError) => {
      console.error("account deletion recovery update failed", String(jobUpdateError));
    });
    return json({ error: "Your files are cleaned, but account-data deletion failed. Your account is still active; safely retry from Settings." }, 500);
  }
  // Auth deletion and its database cascades succeeded. Failure to remove this non-user-facing
  // bookkeeping row cannot undo deletion; it is safe for an administrator to clean up later.
  const { error: jobCleanupError } = await admin.from("account_deletion_jobs").delete().eq("user_id", user.id);
  if (jobCleanupError) console.error("completed account deletion recovery record cleanup failed", jobCleanupError.message);
  return json({ deleted: true });
});
