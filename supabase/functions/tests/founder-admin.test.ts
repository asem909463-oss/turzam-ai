import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_RUNTIME_SETTINGS,
  enabledProviders,
  normalizeRuntimeSettings,
  patchRuntimeSettings,
  quotaForTier,
} from "../_shared/admin-runtime.ts";
import { safePage, safeSearch, validFounderAccessCode } from "../_shared/founder-admin-security.ts";

test("founder code verifier accepts exact server value only", () => {
  const fixtureCode = "test-only-founder-code";
  assert.equal(validFounderAccessCode(fixtureCode, fixtureCode), true);
  assert.equal(validFounderAccessCode(fixtureCode, "test-only-founder-codf"), false);
  assert.equal(validFounderAccessCode(fixtureCode, `${fixtureCode} `), false);
  assert.equal(validFounderAccessCode(fixtureCode, null), false);
  assert.equal(validFounderAccessCode("", fixtureCode), false);
  assert.equal(validFounderAccessCode(fixtureCode, "x".repeat(129)), false);
});

test("runtime settings keep safe defaults for missing or malformed fields", () => {
  const normalized = normalizeRuntimeSettings({ models: { gemini: false }, quotas: { free: { chat: { perDay: -1 } } } });
  assert.equal(normalized.models.gemini, false);
  assert.equal(normalized.models.openai, true);
  assert.equal(normalized.quotasManaged, false);
  assert.equal(normalized.quotas.free.chat.perDay, DEFAULT_RUNTIME_SETTINGS.quotas.free.chat.perDay);
  assert.equal(normalized.maintenance.enabled, false);
  assert.equal(normalized.features.attachments, true);
});

test("settings patch allows bounded daily limits and refuses unsafe or unknown fields", () => {
  const changed = patchRuntimeSettings(DEFAULT_RUNTIME_SETTINGS, { quotas: { free: { chat: { perDay: 75 } } } });
  assert.ok(changed);
  assert.equal(changed.quotasManaged, true);
  assert.equal(quotaForTier(changed, "free", "chat").perDay, 75);
  assert.equal(quotaForTier(changed, "premium", "chat").perDay, 1000);
  assert.equal(patchRuntimeSettings(DEFAULT_RUNTIME_SETTINGS, { quotas: { free: { chat: { perDay: 0 } } } }), null);
  assert.equal(patchRuntimeSettings(DEFAULT_RUNTIME_SETTINGS, { models: { gemini: "yes" } }), null);
  assert.equal(patchRuntimeSettings(DEFAULT_RUNTIME_SETTINGS, { serviceRoleKey: "x" }), null);
});

test("model availability is the intersection of configured flags and server keys", () => {
  const settings = normalizeRuntimeSettings({ models: { gemini: false, openai: true, anthropic: true } });
  assert.deepEqual(enabledProviders(settings, (provider) => provider !== "anthropic"), ["openai"]);
});

test("admin page and search inputs are clamped", () => {
  assert.equal(safePage(0, 1, 100), 1);
  assert.equal(safePage(9, 1, 5), 5);
  assert.equal(safePage("2", 1, 5), 1);
  assert.equal(safeSearch("  founder  "), "founder");
  assert.equal(safeSearch(1), "");
});
