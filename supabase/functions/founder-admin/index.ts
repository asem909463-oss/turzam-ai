import { createClient, type User } from "@supabase/supabase-js";
import { quotaFor, readJsonLimited } from "../_shared/limits.ts";
import { normalizeRuntimeSettings, patchRuntimeSettings } from "../_shared/admin-runtime.ts";
import { safePage, safeSearch, validFounderAccessCode } from "../_shared/founder-admin-security.ts";

const env = (key: string) => Deno.env.get(key) ?? "";
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-founder-session",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" } });
const fail = (message: string, status = 400) => json({ error: message }, status);
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_BODY_BYTES = 32_768;
const SESSION_TTL_MS = 30 * 60 * 1000;
const ATTACHMENT_BUCKET = "attachments";

// deno-lint-ignore no-explicit-any
type AdminClient = ReturnType<typeof createClient<any>>;
type AdminActor = { user: User; isFounder: boolean };

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (n) => n.toString(16).padStart(2, "0")).join("");
}

async function digest(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return hex(new Uint8Array(bytes));
}

function newSessionToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return hex(bytes);
}

async function configuredFounderId(admin: AdminClient): Promise<string | null> {
  const configuredId = env("FOUNDER_USER_ID").trim();
  if (uuidPattern.test(configuredId)) return configuredId;
  const email = env("FOUNDER_ADMIN_EMAIL").trim();
  if (!email || !email.includes("@")) return null;
  const { data, error } = await admin.rpc("admin_user_lookup_by_email", { p_email: email });
  if (error || !data || typeof data.user_id !== "string") return null;
  return data.user_id;
}

function founderMatch(user: User): boolean {
  const id = env("FOUNDER_USER_ID").trim();
  if (id) return uuidPattern.test(id) && id === user.id;
  const email = env("FOUNDER_ADMIN_EMAIL").trim().toLowerCase();
  return !!email && !!user.email_confirmed_at && (user.email ?? "").toLowerCase() === email;
}

async function adminRole(admin: AdminClient, user: User): Promise<AdminActor | null> {
  const isFounder = founderMatch(user);
  if (isFounder) return { user, isFounder: true };
  const { data, error } = await admin.from("founder_admins").select("user_id").eq("user_id", user.id).eq("enabled", true).maybeSingle();
  if (error || !data) return null;
  return { user, isFounder: false };
}

async function audit(admin: AdminClient, actor: User, action: string, targetUserId: string | null, details: Record<string, unknown> = {}) {
  const { error } = await admin.from("admin_audit_log").insert({
    actor_id: actor.id,
    action,
    target_user_id: targetUserId,
    details,
  });
  if (error) throw new Error("audit_unavailable");
}

async function consumeAuthAttempt(admin: AdminClient, userId: string) {
  const { data, error } = await admin.rpc("consume_quota", {
    p_user_id: userId,
    p_kind: "admin_auth",
    p_per_minute: 5,
    p_per_day: 20,
    p_global_per_day: null,
  });
  if (error || !data) return { ok: false, reason: "setup" };
  return { ok: data.ok === true, reason: String(data.reason ?? "") };
}

async function requireAdminSession(req: Request, admin: AdminClient, user: User): Promise<AdminActor | null> {
  const token = req.headers.get("x-founder-session") ?? "";
  if (!/^[a-f0-9]{64}$/i.test(token)) return null;
  const tokenHash = await digest(token);
  const now = new Date();
  const { data: row, error } = await admin
    .from("founder_admin_sessions")
    .select("id,user_id")
    .eq("token_hash", tokenHash)
    .eq("user_id", user.id)
    .is("revoked_at", null)
    .gt("expires_at", now.toISOString())
    .maybeSingle();
  if (error || !row) return null;

  const actor = await adminRole(admin, user);
  if (!actor) {
    await admin.from("founder_admin_sessions").update({ revoked_at: now.toISOString() }).eq("id", row.id);
    return null;
  }
  await admin.from("founder_admin_sessions").update({
    last_used_at: now.toISOString(),
    expires_at: new Date(now.getTime() + SESSION_TTL_MS).toISOString(),
  }).eq("id", row.id);
  return actor;
}

function requireFounder(actor: AdminActor): boolean {
  return actor.isFounder;
}

async function loadRuntimeSettings(admin: AdminClient) {
  const { data, error } = await admin.from("admin_settings").select("value").eq("key", "runtime").maybeSingle();
  if (error) throw new Error("settings_unavailable");
  const settings = normalizeRuntimeSettings(data?.value);
  if (!settings.quotasManaged) {
    for (const kind of ["chat", "search", "aux", "transcribe"] as const) {
      const legacy = quotaFor(kind, env);
      for (const tier of ["free", "premium"] as const) {
        settings.quotas[tier][kind] = { ...settings.quotas[tier][kind], perDay: legacy.perDay };
      }
    }
  }
  return settings;
}

async function removeStorageFolder(admin: AdminClient, prefix: string): Promise<void> {
  for (let round = 0; round < 500; round++) {
    const { data, error } = await admin.storage.from(ATTACHMENT_BUCKET).list(prefix, { limit: 100, offset: 0 });
    if (error) throw new Error("storage_list_failed");
    if (!data?.length) return;
    const files: string[] = [];
    for (const item of data) {
      if (item.id === null) await removeStorageFolder(admin, `${prefix}/${item.name}`);
      else files.push(`${prefix}/${item.name}`);
    }
    if (files.length) {
      const { error: removeError } = await admin.storage.from(ATTACHMENT_BUCKET).remove(files);
      if (removeError) throw new Error("storage_delete_failed");
    }
  }
  throw new Error("storage_cleanup_limit");
}

async function founderDirectoryEntry(admin: AdminClient) {
  const founderId = await configuredFounderId(admin);
  if (!founderId) return null;
  const { data, error } = await admin.auth.admin.getUserById(founderId);
  if (error || !data.user) return null;
  return { userId: data.user.id, email: data.user.email ?? "", displayName: String(data.user.user_metadata?.full_name ?? data.user.user_metadata?.name ?? ""), role: "founder", enabled: true };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return fail("Use POST.", 405);

  const url = env("SUPABASE_URL");
  const anonKey = env("SUPABASE_ANON_KEY");
  const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anonKey || !serviceKey) return fail("The admin backend is not configured.", 503);

  const userClient = createClient(url, anonKey, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: auth, error: authError } = await userClient.auth.getUser();
  if (authError || !auth.user) return fail("Please sign in again.", 401);
  const user = auth.user;
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  const declared = req.headers.get("content-length");
  if (declared && /^\d+$/.test(declared) && Number(declared) > MAX_BODY_BYTES) return fail("That request is too large.", 413);
  const parsed = await readJsonLimited(req, MAX_BODY_BYTES);
  if (!parsed.ok) return fail(parsed.error === "too_large" ? "That request is too large." : "Bad request.", parsed.error === "too_large" ? 413 : 400);
  if (!isRecord(parsed.value)) return fail("Bad request.", 400);
  const body = parsed.value;
  const action = typeof body.action === "string" ? body.action : "";

  try {
    // Public to authenticated users; the payload contains only an active public announcement.
    if (action === "public_announcement") {
      const { data, error } = await admin.from("admin_announcements")
        .select("id,title,body,created_at")
        .eq("active", true)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) return fail("Could not load the current announcement.", 503);
      return json({ announcement: data ?? null });
    }

    if (action === "authenticate") {
      const expectedCode = env("FOUNDER_ACCESS_CODE");
      const founderConfigured = !!env("FOUNDER_USER_ID").trim() || !!env("FOUNDER_ADMIN_EMAIL").trim();
      if (!founderConfigured || !expectedCode) return fail("Founder access is not configured on the server.", 503);
      const attempt = await consumeAuthAttempt(admin, user.id);
      if (!attempt.ok) return fail(attempt.reason === "setup" ? "Founder access is not configured on the server." : "Too many verification attempts. Try again later.", attempt.reason === "setup" ? 503 : 429);

      const actor = await adminRole(admin, user);
      const codeMatches = validFounderAccessCode(expectedCode, body.code);
      if (!actor || !codeMatches) return fail("Unable to verify founder access.", 403);

      const token = newSessionToken();
      const now = new Date();
      const { error } = await admin.from("founder_admin_sessions").insert({
        user_id: user.id,
        token_hash: await digest(token),
        expires_at: new Date(now.getTime() + SESSION_TTL_MS).toISOString(),
      });
      if (error) return fail("Founder access is unavailable. Apply the latest Supabase schema first.", 503);
      await audit(admin, user, "founder_access_granted", null, { role: actor.isFounder ? "founder" : "admin" });
      return json({ accessToken: token, expiresInSeconds: SESSION_TTL_MS / 1000 });
    }

    const actor = await requireAdminSession(req, admin, user);
    if (!actor) return fail("Founder admin access expired. Enter the founder phrase and code again.", 403);

    switch (action) {
      case "logout": {
        const token = req.headers.get("x-founder-session") ?? "";
        await admin.from("founder_admin_sessions").update({ revoked_at: new Date().toISOString() })
          .eq("token_hash", await digest(token)).eq("user_id", user.id).is("revoked_at", null);
        await audit(admin, user, "founder_session_revoked", null);
        return json({ ok: true });
      }
      case "summary": {
        const { data, error } = await admin.rpc("admin_dashboard_summary");
        if (error || !data) return fail("Dashboard data is unavailable. Apply the latest Supabase schema first.", 503);
        return json({ summary: data });
      }
      case "users": {
        const search = safeSearch(body.search, 100);
        const status = ["all", "active", "suspended"].includes(String(body.status)) ? String(body.status) : "all";
        const tier = ["all", "free", "premium"].includes(String(body.tier)) ? String(body.tier) : "all";
        const page = safePage(body.page, 1, 100_000);
        const pageSize = safePage(body.pageSize, 25, 100);
        const { data, error } = await admin.rpc("admin_user_directory", {
          p_search: search,
          p_status: status,
          p_tier: tier,
          p_page: page,
          p_page_size: pageSize,
        });
        if (error || !data) return fail("User data is unavailable. Apply the latest Supabase schema first.", 503);
        return json({ ...data, page, pageSize });
      }
      case "settings": {
        const settings = await loadRuntimeSettings(admin);
        return json({ settings, billing: { configured: false, activeSubscriptions: null, revenue: null, currency: null } });
      }
      case "update_settings": {
        const patch = body.patch;
        const current = await loadRuntimeSettings(admin);
        const next = patchRuntimeSettings(current, patch);
        if (!next) return fail("One or more settings are invalid.", 400);
        const changedSections = isRecord(patch) ? Object.keys(patch).filter((key) => ["quotas", "models", "maintenance", "features"].includes(key)) : [];
        await audit(admin, user, "runtime_settings_update_requested", null, { sections: changedSections });
        const { error } = await admin.from("admin_settings").upsert({ key: "runtime", value: next, updated_at: new Date().toISOString(), updated_by: user.id });
        if (error) return fail("Could not save the settings.", 503);
        await audit(admin, user, "runtime_settings_updated", null, { sections: changedSections });
        return json({ settings: next });
      }
      case "set_user": {
        const userId = typeof body.userId === "string" ? body.userId : "";
        if (!uuidPattern.test(userId)) return fail("Choose a valid account.", 400);
        if (userId === user.id || userId === await configuredFounderId(admin)) return fail("The founder account cannot be changed here.", 403);
        const status = body.status === undefined ? undefined : body.status;
        const tier = body.tier === undefined ? undefined : body.tier;
        if ((status !== undefined && status !== "active" && status !== "suspended") || (tier !== undefined && tier !== "free" && tier !== "premium") || (status === undefined && tier === undefined)) {
          return fail("Choose a valid access or plan update.", 400);
        }
        const { data: target, error: targetError } = await admin.auth.admin.getUserById(userId);
        if (targetError || !target.user) return fail("Account not found.", 404);
        const { data: existing } = await admin.from("admin_account_control").select("tier,account_status,suspension_note")
          .eq("user_id", userId).maybeSingle();
        const nextTier = tier ?? existing?.tier ?? "free";
        const nextStatus = status ?? existing?.account_status ?? "active";
        await audit(admin, user, status === "suspended" ? "user_suspension_requested" : status === "active" ? "user_reactivation_requested" : "user_tier_change_requested", userId, {
          ...(status ? { status } : {}), ...(tier ? { tier } : {}),
        });

        if (status === "suspended") {
          const { error: controlError } = await admin.from("admin_account_control").upsert({
            user_id: userId, tier: nextTier, account_status: "suspended", updated_at: new Date().toISOString(), updated_by: user.id,
          });
          if (controlError) return fail("Could not update the account status.", 503);
          const { error: banError } = await admin.auth.admin.updateUserById(userId, { ban_duration: "876000h" });
          if (banError) {
            await admin.from("admin_account_control").upsert({ user_id: userId, tier: nextTier, account_status: "active", updated_at: new Date().toISOString(), updated_by: user.id });
            return fail("Could not suspend the account.", 503);
          }
        } else if (status === "active") {
          const { error: unbanError } = await admin.auth.admin.updateUserById(userId, { ban_duration: "none" });
          if (unbanError) return fail("Could not reactivate the account.", 503);
          const { error: controlError } = await admin.from("admin_account_control").upsert({
            user_id: userId, tier: nextTier, account_status: "active", updated_at: new Date().toISOString(), updated_by: user.id,
          });
          if (controlError) return fail("Could not update the account status.", 503);
        } else {
          const { error: controlError } = await admin.from("admin_account_control").upsert({
            user_id: userId, tier: nextTier, account_status: nextStatus,
            ...(existing?.suspension_note ? { suspension_note: existing.suspension_note } : {}),
            updated_at: new Date().toISOString(), updated_by: user.id,
          });
          if (controlError) return fail("Could not update the account plan.", 503);
        }
        await audit(admin, user, status === "suspended" ? "user_suspended" : status === "active" ? "user_reactivated" : "user_tier_changed", userId, {
          ...(status ? { status } : {}), ...(tier ? { tier } : {}),
        });
        return json({ ok: true });
      }
      case "delete_user": {
        const userId = typeof body.userId === "string" ? body.userId : "";
        if (!uuidPattern.test(userId) || body.confirm !== "DELETE") return fail("Explicit DELETE confirmation is required.", 400);
        if (userId === user.id || userId === await configuredFounderId(admin)) return fail("The founder account cannot be deleted here.", 403);
        if (!actor.isFounder) return fail("Only the founder can delete accounts.", 403);
        const { data: target, error: targetError } = await admin.auth.admin.getUserById(userId);
        if (targetError || !target.user) return fail("Account not found.", 404);
        await audit(admin, user, "user_delete_requested", userId, { confirmation: "DELETE" });
        try {
          await removeStorageFolder(admin, userId);
        } catch {
          return fail("Could not remove this account's files. The account was not deleted.", 503);
        }
        const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
        if (deleteError) return fail("Could not delete the account. Please retry.", 503);
        await audit(admin, user, "user_deleted", userId);
        return json({ ok: true });
      }
      case "announcement": {
        const title = safeSearch(body.title, 100);
        const message = typeof body.body === "string" ? body.body.trim().slice(0, 500) : "";
        if (!title || !message) return fail("Enter an announcement title and message.", 400);
        await audit(admin, user, "announcement_publish_requested", null, { title });
        const { error: deactivateError } = await admin.from("admin_announcements").update({ active: false }).eq("active", true);
        if (deactivateError) return fail("Could not update announcements.", 503);
        const { data, error } = await admin.from("admin_announcements").insert({ title, body: message, active: true, created_by: user.id })
          .select("id,title,body,created_at").single();
        if (error || !data) return fail("Could not publish this announcement.", 503);
        await audit(admin, user, "announcement_published", null, { id: data.id, title });
        return json({ announcement: data });
      }
      case "admins": {
        const { data, error } = await admin.from("founder_admins").select("user_id,enabled,created_at").order("created_at", { ascending: true }).limit(100);
        if (error) return fail("Could not load administrators.", 503);
        const admins = await Promise.all((data ?? []).map(async (row) => {
          const { data: result } = await admin.auth.admin.getUserById(row.user_id);
          const target = result?.user;
          return { userId: row.user_id, email: target?.email ?? "Unknown account", displayName: String(target?.user_metadata?.full_name ?? target?.user_metadata?.name ?? ""), role: "admin", enabled: row.enabled, createdAt: row.created_at };
        }));
        return json({ founder: await founderDirectoryEntry(admin), admins, canManage: actor.isFounder });
      }
      case "set_admin": {
        if (!requireFounder(actor)) return fail("Only the founder can manage administrators.", 403);
        const email = typeof body.email === "string" ? body.email.trim().slice(0, 254) : "";
        const enabled = body.enabled;
        if (!email.includes("@") || typeof enabled !== "boolean") return fail("Enter an account email and a valid action.", 400);
        const { data: account, error: lookupError } = await admin.rpc("admin_user_lookup_by_email", { p_email: email });
        if (lookupError) return fail("Account lookup is unavailable. Apply the latest Supabase schema first.", 503);
        if (!account?.user_id || typeof account.user_id !== "string") return fail("No registered account matches that email.", 404);
        if (account.user_id === await configuredFounderId(admin)) return fail("The founder already has permanent administrator access.", 400);
        await audit(admin, user, enabled ? "administrator_enable_requested" : "administrator_disable_requested", account.user_id, { enabled });
        const { error } = await admin.from("founder_admins").upsert({ user_id: account.user_id, enabled, created_by: user.id, updated_at: new Date().toISOString() });
        if (error) return fail("Could not update administrator access.", 503);
        await audit(admin, user, enabled ? "administrator_enabled" : "administrator_disabled", account.user_id, { enabled });
        return json({ ok: true });
      }
      case "audit": {
        const { data, error } = await admin.from("admin_audit_log")
          .select("id,actor_id,action,target_user_id,details,created_at")
          .order("created_at", { ascending: false }).limit(100);
        if (error) return fail("Audit log is unavailable.", 503);
        return json({ entries: data ?? [] });
      }
      default:
        return fail("Unknown admin action.", 400);
    }
  } catch (error) {
    console.error("founder admin operation failed", error instanceof Error ? error.message : "unknown");
    return fail("The admin request could not be completed.", 500);
  }
});
