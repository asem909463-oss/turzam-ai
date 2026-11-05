import { fetch } from 'expo/fetch';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from './config';
import { supabase } from './supabase';

const ENDPOINT = `${SUPABASE_URL}/functions/v1/founder-admin`;
let founderSession: string | null = null;

export type PublicAnnouncement = { id: string; title: string; body: string; created_at: string };

export function clearFounderSession() {
  founderSession = null;
}

export function hasFounderSession(): boolean {
  return founderSession !== null;
}

async function request<T>(action: string, payload: Record<string, unknown> = {}, useFounderSession = true): Promise<T> {
  const accessToken = (await supabase.auth.getSession()).data.session?.access_token;
  if (!accessToken) throw new Error('Please sign in again.');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${accessToken}`,
    apikey: SUPABASE_ANON_KEY,
  };
  if (useFounderSession && founderSession) headers['x-founder-session'] = founderSession;
  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers,
    body: JSON.stringify({ action, ...payload }),
  });
  let data: Record<string, unknown> = {};
  try {
    data = await response.json() as Record<string, unknown>;
  } catch {
    // The safe fallback below intentionally omits server details.
  }
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) clearFounderSession();
    throw new Error(typeof data.error === 'string' ? data.error : `Admin request failed (${response.status}).`);
  }
  return data as T;
}

/** Sends the typed code directly to the authenticated server; it is not stored on-device or in chat. */
export async function authenticateFounder(code: string): Promise<void> {
  const result = await request<{ accessToken: string }>('authenticate', { code }, false);
  if (typeof result.accessToken !== 'string' || !/^[a-f0-9]{64}$/i.test(result.accessToken)) {
    throw new Error('Unable to verify founder access.');
  }
  founderSession = result.accessToken;
}

export async function founderAdminRequest<T>(action: string, payload: Record<string, unknown> = {}): Promise<T> {
  if (!founderSession) throw new Error('Founder admin access expired. Enter the founder phrase and code again.');
  return request<T>(action, payload, true);
}

export async function endFounderSession(): Promise<void> {
  if (!founderSession) return;
  try {
    await founderAdminRequest('logout');
  } finally {
    clearFounderSession();
  }
}

export async function loadActiveAnnouncement(): Promise<PublicAnnouncement | null> {
  const result = await request<{ announcement: PublicAnnouncement | null }>('public_announcement', {}, false);
  return result.announcement ?? null;
}
