import { useEffect, useState, useCallback } from 'react';
import { api, ApiError, errorText } from './api.js';

export function useAuth() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let ignore = false;
    api('/api/auth/me')
      .then((data) => { if (!ignore) setUser(data?.user || null); })
      .catch((e) => {
        if (ignore) return;
        if (!(e instanceof ApiError && e.status === 401)) setError(errorText(e));
      })
      .finally(() => { if (!ignore) setLoading(false); });
    return () => { ignore = true; };
  }, []);

  const signIn = useCallback(async (email, password) => {
    setError(null); setLoading(true);
    try {
      const data = await api('/api/auth/login', { method: 'POST', body: { email, password } });
      setUser(data?.user || null);
      return { data };
    } catch (e) {
      const text = errorText(e);
      setError(text);
      return { error: text };
    } finally {
      setLoading(false);
    }
  }, []);

  const signUp = useCallback(async (email, password) => {
    setError(null); setLoading(true);
    try {
      const data = await api('/api/auth/signup', { method: 'POST', body: { email, password } });
      setUser(data?.user || null);
      return { data };
    } catch (e) {
      const text = errorText(e);
      setError(text);
      return { error: text };
    } finally {
      setLoading(false);
    }
  }, []);

  const signOut = useCallback(async () => {
    try {
      await api('/api/auth/logout', { method: 'POST' });
    } catch (e) {
      console.error('signOut error', e);
    }
    setUser(null);
  }, []);

  return { user, loading, error, signIn, signUp, signOut };
}
