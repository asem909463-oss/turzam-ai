export type SubscriptionPlan = "free" | "plus" | "pro";

export const FREE_CHAT_COOLDOWN_SECONDS = 6 * 60 * 60;
export const DEFAULT_FREE_CHAT_LIMIT = 10;
export const DEFAULT_PRO_CHAT_PER_DAY = 500;

export type RevenueCatConfig = {
  plusEntitlementId: string;
  proEntitlementId: string;
  plusProductId: string;
  proProductId: string;
};

export type VerifiedPlan = {
  plan: SubscriptionPlan;
  expiresAt: string | null;
};

const object = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;

function activeAppleSubscription(
  subscriber: Record<string, unknown>,
  entitlementId: string,
  productId: string,
  nowMs: number,
): string | null {
  const entitlements = object(subscriber.entitlements);
  const entitlement = object(entitlements?.[entitlementId]);
  if (!entitlement || entitlement.product_identifier !== productId) return null;

  const subscriptions = object(subscriber.subscriptions);
  const subscription = object(subscriptions?.[productId]);
  if (!subscription || subscription.store !== "app_store" || subscription.refunded_at) return null;

  const date = (value: unknown) => typeof value === "string" && value ? Date.parse(value) : NaN;
  const validDates = [
    date(entitlement.expires_date),
    date(subscription.expires_date),
    date(entitlement.grace_period_expires_date),
    date(subscription.grace_period_expires_date),
  ].filter(Number.isFinite);
  const validUntil = validDates.length ? Math.max(...validDates) : NaN;
  if (!Number.isFinite(validUntil) || validUntil <= nowMs) return null;

  const iso = new Date(validUntil).toISOString();
  return iso;
}

/**
 * Interpret only RevenueCat's server API response. Client-supplied entitlement flags or
 * transaction claims are deliberately not accepted by this function.
 */
export function planFromRevenueCatSubscriber(
  value: unknown,
  config: RevenueCatConfig,
  nowMs = Date.now(),
): VerifiedPlan {
  const root = object(value);
  const subscriber = object(root?.subscriber);
  if (!subscriber) return { plan: "free", expiresAt: null };

  const proUntil = activeAppleSubscription(subscriber, config.proEntitlementId, config.proProductId, nowMs);
  if (proUntil) return { plan: "pro", expiresAt: proUntil };

  const plusUntil = activeAppleSubscription(subscriber, config.plusEntitlementId, config.plusProductId, nowMs);
  if (plusUntil) return { plan: "plus", expiresAt: plusUntil };

  return { plan: "free", expiresAt: null };
}

function intSetting(get: (key: string) => string, key: string, fallback: number, min: number, max: number): number {
  const n = Number.parseInt(get(key), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export function freeChatLimit(get: (key: string) => string): number {
  return intSetting(get, "FREE_CHAT_LIMIT", DEFAULT_FREE_CHAT_LIMIT, 1, 500);
}

export function chatDailyLimit(plan: SubscriptionPlan, get: (key: string) => string, currentDefault: number): number {
  if (plan === "plus") return intSetting(get, "LIMIT_PLUS_CHAT_PER_DAY", currentDefault, 1, 5000);
  if (plan === "pro") return intSetting(get, "LIMIT_PRO_CHAT_PER_DAY", DEFAULT_PRO_CHAT_PER_DAY, 1, 5000);
  return currentDefault;
}

export function revenueCatConfig(get: (key: string) => string): RevenueCatConfig {
  return {
    plusEntitlementId: get("REVENUECAT_PLUS_ENTITLEMENT_ID") || "turzam_plus",
    proEntitlementId: get("REVENUECAT_PRO_ENTITLEMENT_ID") || "turzam_pro",
    plusProductId: get("REVENUECAT_PLUS_PRODUCT_ID") || "turzam_plus_monthly",
    proProductId: get("REVENUECAT_PRO_PRODUCT_ID") || "turzam_pro_monthly",
  };
}

export async function verifyRevenueCatPlan(
  appUserId: string,
  apiKey: string,
  config: RevenueCatConfig,
  fetcher: typeof fetch = fetch,
  nowMs = Date.now(),
): Promise<{ configured: boolean; verified: boolean; plan: SubscriptionPlan; expiresAt: string | null }> {
  if (!apiKey.trim()) return { configured: false, verified: false, plan: "free", expiresAt: null };

  const response = await fetcher(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(appUserId)}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
    signal: AbortSignal.timeout(7000),
  });
  if (!response.ok) throw new Error(`RevenueCat subscriber verification returned ${response.status}.`);
  const plan = planFromRevenueCatSubscriber(await response.json(), config, nowMs);
  return { configured: true, verified: true, ...plan };
}
