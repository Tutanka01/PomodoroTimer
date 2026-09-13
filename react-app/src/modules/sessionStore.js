import { supabase } from './supabaseClient.js';

// Logs a finished session (pomodoro or break) if user authenticated
export async function logSession({ user, startedAt, endedAt, mode, intention, rating }) {
  if (!user) return;
  try {
    const { error } = await supabase
      .from('focus_sessions')
      .insert({ user_id: user.id, started_at: startedAt, ended_at: endedAt, mode, intention, productivity_rating: rating || null });
    if (error) console.error('logSession error', error);
  } catch (e) {
    console.error(e);
  }
}

export async function fetchRecentStats(user, { days = 7, includeAllDaily = false, limitSessions = 200 } = {}) {
  if (!user) return { sessions: [], daily: [], allDaily: [] };

  const isNumericRange = typeof days === 'number' && days > 0;
  const sinceDate = isNumericRange ? new Date(Date.now() - days * 24 * 3600 * 1000) : null;
  const sinceISO = sinceDate ? sinceDate.toISOString() : null;

  let sessionsQuery = supabase
    .from('focus_sessions')
    .select('*')
    .order('started_at', { ascending: false });

  if (sinceISO) sessionsQuery = sessionsQuery.gte('started_at', sinceISO);
  if (limitSessions) sessionsQuery = sessionsQuery.limit(limitSessions);

  const { data: sessions, error: sessionsError } = await sessionsQuery;
  if (sessionsError) console.error(sessionsError);

  let daily = [];
  let allDaily = [];

  if (includeAllDaily) {
    const { data: dailyFull, error: dailyFullError } = await supabase
      .from('user_daily_focus')
      .select('*')
      .order('day', { ascending: true })
      .limit(3650);
    if (dailyFullError) {
      console.error(dailyFullError);
    }
    allDaily = dailyFull || [];
    if (sinceDate) {
      const sinceKey = toDateKey(sinceDate);
      daily = allDaily.filter((d) => d.day >= sinceKey);
    } else {
      daily = allDaily;
    }
  } else {
    let dailyQuery = supabase
      .from('user_daily_focus')
      .select('*')
      .order('day', { ascending: true });
    if (sinceDate) {
      dailyQuery = dailyQuery.gte('day', toDateKey(sinceDate));
    }
    const { data: dailyFiltered, error: dailyError } = await dailyQuery;
    if (dailyError) console.error(dailyError);
    daily = dailyFiltered || [];
  }

  return { sessions: sessions || [], daily, allDaily };
}

function toDateKey(date) {
  const utc = new Date(date);
  utc.setUTCHours(0, 0, 0, 0);
  return utc.toISOString().slice(0, 10);
}
