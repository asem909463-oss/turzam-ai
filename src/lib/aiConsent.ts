import AsyncStorage from '@react-native-async-storage/async-storage';

const CONSENT_VERSION = 'v1';
const CONSENT_VALUE = 'accepted';

function consentKey(userId: string): string {
  return `turzam.ai_processing_consent.${CONSENT_VERSION}.${encodeURIComponent(userId)}`;
}

export async function getAiProcessingConsent(userId: string | null | undefined): Promise<boolean> {
  if (!userId) return false;
  return (await AsyncStorage.getItem(consentKey(userId))) === CONSENT_VALUE;
}

export async function setAiProcessingConsent(userId: string | null | undefined, accepted: boolean): Promise<void> {
  if (!userId) throw new Error('Sign in to manage your AI processing choice.');
  const key = consentKey(userId);
  if (accepted) await AsyncStorage.setItem(key, CONSENT_VALUE);
  else await AsyncStorage.removeItem(key);
}
