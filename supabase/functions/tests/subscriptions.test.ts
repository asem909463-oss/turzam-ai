import { test } from "node:test";
import assert from "node:assert/strict";
import {
  chatDailyLimit,
  DEFAULT_FREE_CHAT_LIMIT,
  freeChatLimit,
  FREE_CHAT_COOLDOWN_SECONDS,
  planFromRevenueCatSubscriber,
  revenueCatConfig,
  verifyRevenueCatPlan,
} from "../_shared/subscriptions.ts";

const now = Date.parse("2026-11-02T12:00:00Z");
const config = {
  plusEntitlementId: "turzam_plus",
  proEntitlementId: "turzam_pro",
  plusProductId: "turzam_plus_monthly",
  proProductId: "turzam_pro_monthly",
};
const future = "2026-12-02T12:00:00.000Z";

function record(plan: "plus" | "pro", store = "app_store", expiration = future) {
  const productId = plan === "pro" ? config.proProductId : config.plusProductId;
  const entitlementId = plan === "pro" ? config.proEntitlementId : config.plusEntitlementId;
  return {
    subscriber: {
      entitlements: {
        [entitlementId]: {
          product_identifier: productId,
          expires_date: expiration,
          grace_period_expires_date: null,
        },
      },
      subscriptions: {
        [productId]: {
          store,
          expires_date: expiration,
          grace_period_expires_date: null,
          refunded_at: null,
        },
      },
    },
  };
}

test("only an active App Store entitlement matching the configured product grants Plus", () => {
  assert.deepEqual(planFromRevenueCatSubscriber(record("plus"), config, now), {
    plan: "plus",
    expiresAt: future,
  });
});

test("Pro takes precedence when a subscriber has both valid tier entitlements", () => {
  const plus = record("plus").subscriber;
  const pro = record("pro").subscriber;
  assert.equal(
    planFromRevenueCatSubscriber({ subscriber: {
      entitlements: { ...plus.entitlements, ...pro.entitlements },
      subscriptions: { ...plus.subscriptions, ...pro.subscriptions },
    } }, config, now).plan,
    "pro",
  );
});

test("expired, refunded, mismatched, and non-App-Store subscription records never grant access", () => {
  assert.equal(planFromRevenueCatSubscriber(record("pro", "app_store", "2026-11-02T11:59:59Z"), config, now).plan, "free");
  assert.equal(planFromRevenueCatSubscriber(record("plus", "promotional"), config, now).plan, "free");

  const refunded = record("plus");
  refunded.subscriber.subscriptions.turzam_plus_monthly.refunded_at = "2026-11-01T00:00:00Z";
  assert.equal(planFromRevenueCatSubscriber(refunded, config, now).plan, "free");

  const mismatched = record("pro");
  mismatched.subscriber.entitlements.turzam_pro.product_identifier = "another_product";
  assert.equal(planFromRevenueCatSubscriber(mismatched, config, now).plan, "free");
});

test("an active RevenueCat grace period keeps an App Store entitlement active", () => {
  const payload = record("plus", "app_store", "2026-11-01T00:00:00Z");
  payload.subscriber.entitlements.turzam_plus.grace_period_expires_date = future;
  payload.subscriber.subscriptions.turzam_plus_monthly.grace_period_expires_date = future;
  assert.equal(planFromRevenueCatSubscriber(payload, config, now).plan, "plus");
});

test("server verifier uses the authenticated app user ID and secret bearer key", async () => {
  let requestedUrl = "";
  let authorization = "";
  const result = await verifyRevenueCatPlan(
    "supabase-user-123",
    "server-only-key",
    config,
    (url, init) => {
      requestedUrl = String(url);
      authorization = new Headers(init?.headers).get("Authorization") ?? "";
      return Promise.resolve(new Response(JSON.stringify(record("pro")), { status: 200 }));
    },
    now,
  );
  assert.equal(requestedUrl, "https://api.revenuecat.com/v1/subscribers/supabase-user-123");
  assert.equal(authorization, "Bearer server-only-key");
  assert.deepEqual(result, { configured: true, verified: true, plan: "pro", expiresAt: future });
});

test("Free and paid message limits have bounded configurable defaults; Free cooldown is six hours", () => {
  assert.equal(freeChatLimit(() => ""), DEFAULT_FREE_CHAT_LIMIT);
  assert.equal(freeChatLimit((key) => key === "FREE_CHAT_LIMIT" ? "0" : ""), 1);
  assert.equal(freeChatLimit((key) => key === "FREE_CHAT_LIMIT" ? "1000" : ""), 500);
  assert.equal(chatDailyLimit("free", () => "", 150), 150);
  assert.equal(chatDailyLimit("plus", () => "", 150), 150);
  assert.equal(chatDailyLimit("pro", () => "", 150), 500);
  assert.equal(chatDailyLimit("pro", (key) => key === "LIMIT_PRO_CHAT_PER_DAY" ? "250" : "", 150), 250);
  assert.equal(FREE_CHAT_COOLDOWN_SECONDS, 21600);
});

test("RevenueCat product and entitlement identifiers are configurable", () => {
  const env = (key: string) => ({
    REVENUECAT_PLUS_ENTITLEMENT_ID: "plus_access",
    REVENUECAT_PRO_ENTITLEMENT_ID: "pro_access",
    REVENUECAT_PLUS_PRODUCT_ID: "plus_monthly_v2",
    REVENUECAT_PRO_PRODUCT_ID: "pro_monthly_v2",
  } as Record<string, string>)[key] ?? "";
  assert.deepEqual(revenueCatConfig(env), {
    plusEntitlementId: "plus_access",
    proEntitlementId: "pro_access",
    plusProductId: "plus_monthly_v2",
    proProductId: "pro_monthly_v2",
  });
});
