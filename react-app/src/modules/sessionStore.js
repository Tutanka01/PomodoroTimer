import { supabase } from './supabaseClient.js';

// Logs a finished session (pomodoro or break) if user authenticated
export async function logSession({ user, startedAt, endedAt, mode, intention, rating }) {
  if (!user) return;
  try {
    const { error } = await supabase
      .from('focus_sessions')
  .insert({ user_id: user.id, started_at: startedAt, ended_at: endedAt, mode, intention, productivity_rating: rating || null });
    if (error) console.error('logSession error', error);
  } catch(e){ console.error(e); }
}

export async function fetchRecentStats(user, { days = 7 } = {}) {
  if (!user) return { sessions: [], daily: [] };
  const since = new Date(Date.now() - days*24*3600*1000).toISOString();
  const { data: sessions, error } = await supabase
    .from('focus_sessions')
    .select('*')
    .gte('started_at', since)
    .order('started_at', { ascending: false })
    .limit(100);
  if (error) { console.error(error); return { sessions: [], daily: [] }; }
  const { data: daily } = await supabase
    .from('user_daily_focus')
    .select('*')
    .gte('day', (new Date(Date.now() - days*24*3600*1000)).toISOString().slice(0,10));
  return { sessions: sessions || [], daily: daily || [] };
}
