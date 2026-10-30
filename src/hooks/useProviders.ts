import { useCallback, useEffect, useState } from 'react';
import { callFunction } from '../lib/stream';
import { supabase } from '../lib/supabase';
import type { ProviderInfo } from '../types';

let cache: ProviderInfo[] | null = null;

/** Which AI providers the server can really use (it only says "available" when a key is set). */
export function useProviders() {
  const [providers, setProviders] = useState<ProviderInfo[] | null>(cache);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token;
      if (!token) return;
      const res = await callFunction<{ providers: ProviderInfo[] }>(token, { action: 'models' });
      cache = res.providers;
      setProviders(res.providers);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not reach the server.');
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { providers, error, refresh };
}
