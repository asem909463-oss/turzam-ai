// Run with: npm run test:edge   (Node 22+, no install needed)
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  geminiAcceptsTemperature,
  geminiThinkingLevel,
  LIMITS,
  maxOutputTokens,
  providerErrorMessage,
  quotaFor,
  thinkingHeadroom,
  validateChat,
} from "../_shared/limits.ts";

const noEnv = () => "";
const msg = (text: string, extra = {}) => ({ role: "user", text, ...extra });

test("validateChat accepts a normal request and defaults unknown values", () => {
  const r = validateChat({ mode: "evil", persona: "x", provider: "other", messages: [msg("hi")] });
  assert.ok(r.ok);
  assert.equal(r.value.mode, "founder");
  assert.equal(r.value.persona, "none");
  assert.equal(r.value.provider, "auto");
  assert.equal(r.value.search, false);
});

test("validateChat rejects bad shapes", () => {
  assert.equal(validateChat(null).ok, false);
  assert.equal(validateChat({ messages: [] }).ok, false);
  assert.equal(validateChat({ messages: [msg("   ")] }).ok, false);
  assert.equal(validateChat({ messages: [{ role: "model", text: "hi" }] }).ok, false);
  assert.equal(validateChat({ messages: [msg("x".repeat(LIMITS.maxUserChars + 1))] }).ok, false);
  const files = Array.from({ length: LIMITS.maxFilesPerMessage + 1 }, (_, i) => ({ name: "a", mime: "image/png", path: `u/c/${i}` }));
  assert.equal(validateChat({ messages: [msg("hi", { files })] }).ok, false);
});

test("validateChat keeps only the newest messages within the size budget", () => {
  const big = "y".repeat(LIMITS.maxUserChars);
  const messages = Array.from({ length: 30 }, (_, i) => (i % 2 ? { role: "model", text: big } : msg(big)));
  messages.push(msg("last"));
  const r = validateChat({ messages });
  assert.ok(r.ok);
  const total = r.value.messages.reduce((n, m) => n + m.text.length, 0);
  assert.ok(total <= LIMITS.maxTotalChars + LIMITS.maxUserChars);
  assert.equal(r.value.messages.at(-1)?.text, "last");
  assert.ok(r.value.messages.length < messages.length);
});

test("validateChat drops malformed files and trims fields", () => {
  const r = validateChat({ messages: [msg("hi", { files: [{ name: 5 }, null, { name: "a".repeat(500), mime: "image/png", path: "u/c/f.png" }] })] });
  assert.ok(r.ok);
  assert.equal(r.value.messages[0].files.length, 1);
  assert.equal(r.value.messages[0].files[0].name.length, 120);
});

test("quotas have sane defaults and can be overridden within bounds", () => {
  assert.deepEqual(quotaFor("chat", noEnv), { perMinute: 12, perDay: 150 });
  const env = (k: string) => ({ LIMIT_CHAT_PER_DAY: "50", LIMIT_CHAT_PER_MINUTE: "99999" } as Record<string, string>)[k] ?? "";
  assert.deepEqual(quotaFor("chat", env), { perMinute: 120, perDay: 50 });
  assert.equal(quotaFor("chat", () => "abc").perDay, 150);
});

test("output token limit is bounded", () => {
  assert.equal(maxOutputTokens(noEnv), 4096);
  assert.equal(maxOutputTokens(() => "999999"), 16000);
  assert.equal(maxOutputTokens(() => "5"), 256);
});

test("Gemini 3.x settings", () => {
  assert.equal(geminiThinkingLevel("gemini-3.8-flash", "founder", noEnv), "low");
  assert.equal(geminiThinkingLevel("gemini-3.8-flash", "think", noEnv), "high");
  assert.equal(geminiThinkingLevel("gemini-3.8-flash", "founder", () => "medium"), "medium");
  assert.equal(geminiThinkingLevel("gemini-3.8-flash", "founder", () => "minimal"), "low");
  assert.equal(geminiThinkingLevel("gemini-2.5-flash", "founder", noEnv), null);
  assert.equal(geminiAcceptsTemperature("gemini-3.8-flash"), false);
  assert.equal(geminiAcceptsTemperature("gemini-2.5-flash"), true);
  assert.ok(thinkingHeadroom("high") > thinkingHeadroom("low"));
  assert.equal(thinkingHeadroom(null), 0);
});

test("provider errors are friendly and never include raw details", () => {
  assert.match(providerErrorMessage("Gemini", 429), /busy|quota/i);
  assert.match(providerErrorMessage("Claude", 401), /key/i);
  assert.match(providerErrorMessage("ChatGPT", 503), /problems/i);
});

test("client and server file limits match (src/lib/attachments.ts)", () => {
  const src = readFileSync(new URL("../../../src/lib/attachments.ts", import.meta.url), "utf8");
  const num = (name: string) => {
    const m = new RegExp(`export const ${name}\\s*=\\s*([^;]+);`).exec(src);
    assert.ok(m, `${name} not found`);
    return Function(`return (${m[1]})`)() as number;
  };
  assert.equal(num("MAX_FILES"), LIMITS.maxFilesPerMessage);
  assert.equal(num("MAX_FILE_BYTES"), LIMITS.maxFileBytes);
  assert.equal(num("MAX_TOTAL_BYTES"), LIMITS.maxBytesPerMessage);
});

test("bucket size limit in schema.sql matches the per-file limit", () => {
  const sql = readFileSync(new URL("../../schema.sql", import.meta.url), "utf8");
  assert.ok(sql.includes(`false, ${LIMITS.maxFileBytes})`));
});
