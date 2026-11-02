import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { AppOwnership } from 'expo-constants';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import Purchases, { type PurchasesPackage } from 'react-native-purchases';
import { useAuth } from './AuthContext';
import {
  REVENUECAT_IOS_API_KEY,
  TURZAM_PLUS_PRICE_FALLBACK,
  TURZAM_PLUS_PRODUCT_ID,
  TURZAM_PRO_PRICE_FALLBACK,
  TURZAM_PRO_PRODUCT_ID,
} from '../lib/config';
import { supabase } from '../lib/supabase';

export type PaidPlan = 'free' | 'plus' | 'pro';
export type PlanTier = Exclude<PaidPlan, 'free'>;

type SubscriptionSnapshot = {
  plan: PaidPlan;
  expiresAt: string | null;
  verified: boolean;
  verificationReady: boolean;
  freeChatLimit: number;
  plusChatPerDay: number;
  proChatPerDay: number;
  freeChatsRemaining: number | null;
  cooldownUntil: string | null;
};

type PurchaseResult = { success: boolean; cancelled?: boolean; message: string };

type SubscriptionState = {
  status: SubscriptionSnapshot;
  loading: boolean;
  error: string | null;
  storeAvailable: boolean;
  packages: Partial<Record<PlanTier, PurchasesPackage>>;
  prices: Record<PlanTier, string>;
  busyPlan: PlanTier | 'restore' | null;
  refresh: () => Promise<SubscriptionSnapshot | null>;
  purchase: (plan: PlanTier) => Promise<PurchaseResult>;
  restore: () => Promise<PurchaseResult>;
  manageSubscription: () => Promise<void>;
};

const FREE_STATUS: SubscriptionSnapshot = {
  plan: 'free',
  expiresAt: null,
  verified: false,
  verificationReady: false,
  freeChatLimit: 10,
  plusChatPerDay: 150,
  proChatPerDay: 500,
  freeChatsRemaining: 10,
  cooldownUntil: null,
};

const SubscriptionContext = createContext<SubscriptionState | null>(null);
let sdkConfigured = false;
let sdkUserId: string | null = null;
let sdkApiKey = '';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function isPlan(value: unknown): value is PaidPlan {
  return value === 'free' || value === 'plus' || value === 'pro';
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'message' in error) return String((error as { message: unknown }).message);
  return 'The App Store could not complete this request. Please try again.';
}

export function SubscriptionProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [status, setStatus] = useState<SubscriptionSnapshot>(FREE_STATUS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [storeAvailable, setStoreAvailable] = useState(false);
  const [packages, setPackages] = useState<Partial<Record<PlanTier, PurchasesPackage>>>({});
  const [prices, setPrices] = useState<Record<PlanTier, string>>({
    plus: TURZAM_PLUS_PRICE_FALLBACK,
    pro: TURZAM_PRO_PRICE_FALLBACK,
  });
  const [busyPlan, setBusyPlan] = useState<PlanTier | 'restore' | null>(null);

  const fetchStatus = useCallback(async (): Promise<SubscriptionSnapshot | null> => {
    if (!userId) {
      setStatus(FREE_STATUS);
      return null;
    }
    const { data, error: invokeError } = await supabase.functions.invoke('subscriptions', {
      body: { action: 'status' },
    });
    if (invokeError || !data || !isPlan(data.plan)) {
      setError(invokeError?.message ?? 'Could not verify the subscription with Turzam.');
      return null;
    }
    const next: SubscriptionSnapshot = {
      plan: data.plan,
      expiresAt: typeof data.expiresAt === 'string' ? data.expiresAt : null,
      verified: data.verified === true,
      verificationReady: data.verificationReady === true,
      freeChatLimit: Number.isFinite(Number(data.freeChatLimit)) ? Number(data.freeChatLimit) : 10,
      plusChatPerDay: Number.isFinite(Number(data.plusChatPerDay)) ? Number(data.plusChatPerDay) : 150,
      proChatPerDay: Number.isFinite(Number(data.proChatPerDay)) ? Number(data.proChatPerDay) : 500,
      freeChatsRemaining: data.freeChatsRemaining == null ? null : Math.max(0, Number(data.freeChatsRemaining)),
      cooldownUntil: typeof data.cooldownUntil === 'string' ? data.cooldownUntil : null,
    };
    setStatus(next);
    setError(null);
    return next;
  }, [userId]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      return await fetchStatus();
    } finally {
      setLoading(false);
    }
  }, [fetchStatus]);

  useEffect(() => {
    let cancelled = false;
    setStatus(FREE_STATUS);
    setPackages({});
    setPrices({ plus: TURZAM_PLUS_PRICE_FALLBACK, pro: TURZAM_PRO_PRICE_FALLBACK });
    setError(null);
    setLoading(true);

    (async () => {
      if (!userId) {
        if (sdkConfigured && sdkUserId) {
          try {
            await Purchases.logOut();
          } catch {
            // Sign-out still clears the app-side account; a later user is explicitly identified.
          }
          sdkUserId = null;
        }
        setStoreAvailable(false);
        setLoading(false);
        return;
      }

      let nativeStoreReady = false;
      if (Platform.OS === 'ios' && REVENUECAT_IOS_API_KEY && Constants.appOwnership !== AppOwnership.Expo) {
        try {
          if (!sdkConfigured || sdkApiKey !== REVENUECAT_IOS_API_KEY) {
            Purchases.configure({ apiKey: REVENUECAT_IOS_API_KEY, appUserID: userId });
            sdkConfigured = true;
            sdkApiKey = REVENUECAT_IOS_API_KEY;
            sdkUserId = userId;
          } else if (sdkUserId !== userId) {
            await Purchases.logIn(userId);
            sdkUserId = userId;
          }
          nativeStoreReady = true;
          const offeringResult = await Purchases.getOfferings();
          const offered = offeringResult.current?.availablePackages ?? [];
          const plus = offered.find((p) => p.product.identifier === TURZAM_PLUS_PRODUCT_ID);
          const pro = offered.find((p) => p.product.identifier === TURZAM_PRO_PRODUCT_ID);
          if (!cancelled) {
            setPackages({ plus, pro });
            setPrices({
              plus: plus?.product.priceString || TURZAM_PLUS_PRICE_FALLBACK,
              pro: pro?.product.priceString || TURZAM_PRO_PRICE_FALLBACK,
            });
          }
        } catch (e) {
          if (!cancelled) setError(errorMessage(e));
        }
      }

      if (!cancelled) setStoreAvailable(nativeStoreReady);
      try {
        await fetchStatus();
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [userId, fetchStatus]);

  const verifyAfterStoreChange = useCallback(async (requested: PlanTier): Promise<SubscriptionSnapshot | null> => {
    // StoreKit/RevenueCat sync can be slightly asynchronous. Every retry is still server-verified.
    for (let attempt = 0; attempt < 5; attempt++) {
      const next = await fetchStatus();
      if (next?.plan === requested || (requested === 'plus' && next?.plan === 'pro')) return next;
      if (attempt < 4) await sleep(1000 * (attempt + 1));
    }
    return null;
  }, [fetchStatus]);

  const purchase = useCallback(async (plan: PlanTier): Promise<PurchaseResult> => {
    if (Platform.OS !== 'ios' || !storeAvailable) {
      return { success: false, message: 'Real Apple purchases require Turzam’s iOS development or App Store build.' };
    }
    if (!status.verificationReady) {
      return { success: false, message: 'Purchases are paused until Turzam’s server-side RevenueCat verification is configured.' };
    }
    const selected = packages[plan];
    if (!selected) return { success: false, message: 'This plan is not available in the App Store yet. Check App Store Connect and RevenueCat product setup.' };

    setBusyPlan(plan);
    try {
      await Purchases.purchasePackage(selected);
      const verified = await verifyAfterStoreChange(plan);
      if (verified) return { success: true, message: `Turzam ${plan === 'plus' ? 'Plus' : 'Pro'} is active.` };
      return {
        success: false,
        message: 'Apple completed the purchase, but Turzam has not verified the subscription yet. Premium access stays locked until verification succeeds; try Restore Purchases shortly.',
      };
    } catch (e) {
      if (e && typeof e === 'object' && 'userCancelled' in e && (e as { userCancelled?: boolean }).userCancelled) {
        return { success: false, cancelled: true, message: 'Purchase cancelled.' };
      }
      return { success: false, message: errorMessage(e) };
    } finally {
      setBusyPlan(null);
    }
  }, [packages, status.verificationReady, storeAvailable, verifyAfterStoreChange]);

  const restore = useCallback(async (): Promise<PurchaseResult> => {
    if (Platform.OS !== 'ios' || !storeAvailable) {
      return { success: false, message: 'Restore Purchases is available in Turzam’s iOS app.' };
    }
    setBusyPlan('restore');
    try {
      await Purchases.restorePurchases();
      if (!status.verificationReady) {
        await fetchStatus();
        return { success: false, message: 'Restore completed, but server-side RevenueCat verification is not configured, so no premium access was unlocked.' };
      }
      let verified: SubscriptionSnapshot | null = null;
      for (let attempt = 0; attempt < 5; attempt++) {
        verified = await fetchStatus();
        if (verified?.plan === 'plus' || verified?.plan === 'pro') break;
        if (attempt < 4) await sleep(1000 * (attempt + 1));
      }
      if (verified?.plan === 'plus' || verified?.plan === 'pro') {
        return { success: true, message: `Turzam ${verified.plan === 'plus' ? 'Plus' : 'Pro'} has been restored and verified.` };
      }
      return { success: false, message: 'No active Turzam subscription was found for this Apple account.' };
    } catch (e) {
      return { success: false, message: errorMessage(e) };
    } finally {
      setBusyPlan(null);
    }
  }, [fetchStatus, status.verificationReady, storeAvailable]);

  const manageSubscription = useCallback(async () => {
    if (Platform.OS === 'ios' && storeAvailable) {
      await Purchases.showManageSubscriptions();
    }
  }, [storeAvailable]);

  const value = useMemo<SubscriptionState>(() => ({
    status,
    loading,
    error,
    storeAvailable,
    packages,
    prices,
    busyPlan,
    refresh,
    purchase,
    restore,
    manageSubscription,
  }), [status, loading, error, storeAvailable, packages, prices, busyPlan, refresh, purchase, restore, manageSubscription]);

  return <SubscriptionContext.Provider value={value}>{children}</SubscriptionContext.Provider>;
}

export function useSubscription(): SubscriptionState {
  const context = useContext(SubscriptionContext);
  if (!context) throw new Error('useSubscription must be used inside SubscriptionProvider');
  return context;
}
