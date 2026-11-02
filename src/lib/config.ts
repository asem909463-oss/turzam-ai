export const SUPABASE_URL = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? '').trim();
export const SUPABASE_ANON_KEY = (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '').trim();
export const REVENUECAT_IOS_API_KEY = (process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY ?? '').trim();
export const TURZAM_PLUS_PRODUCT_ID = (process.env.EXPO_PUBLIC_TURZAM_PLUS_PRODUCT_ID ?? 'turzam_plus_monthly').trim();
export const TURZAM_PRO_PRODUCT_ID = (process.env.EXPO_PUBLIC_TURZAM_PRO_PRODUCT_ID ?? 'turzam_pro_monthly').trim();
export const TURZAM_PLUS_PRICE_FALLBACK = (process.env.EXPO_PUBLIC_TURZAM_PLUS_PRICE ?? '$5.99').trim();
export const TURZAM_PRO_PRICE_FALLBACK = (process.env.EXPO_PUBLIC_TURZAM_PRO_PRICE ?? '$11.99').trim();

// Optional: shown in the Terms, Privacy and Cookie policies.
export const SUPPORT_EMAIL = (process.env.EXPO_PUBLIC_SUPPORT_EMAIL ?? '').trim();

export const isConfigured =
  SUPABASE_URL.startsWith('https://') &&
  !SUPABASE_URL.includes('YOUR-PROJECT-REF') &&
  SUPABASE_ANON_KEY.length > 20 &&
  !SUPABASE_ANON_KEY.includes('YOUR-ANON');
