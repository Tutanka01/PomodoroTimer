import { useEffect, useState, useCallback } from 'react';
import { supabase } from './supabaseClient.js';

export function useAuth() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let ignore = false;
    supabase.auth.getSession().then(({ data }) => { if(!ignore){ setSession(data.session); setLoading(false);} });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => { setSession(newSession); });
    return () => { ignore = true; listener.subscription.unsubscribe(); };
  }, []);

  const signIn = useCallback(async (email, password) => {
    setError(null); setLoading(true);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setError(error.message);
    setSession(data?.session || null);
    setLoading(false);
    return { data, error };
  }, []);

  const signUp = useCallback(async (email, password) => {
    setError(null); setLoading(true);
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) setError(error.message);
    setSession(data?.session || null);
    setLoading(false);
    return { data, error };
  }, []);

  const signOut = useCallback(async () => { await supabase.auth.signOut(); setSession(null); }, []);

  return { session, user: session?.user || null, loading, error, signIn, signUp, signOut };
}
