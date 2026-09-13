import { api } from './api.js';

// Enregistre une session terminée (le paramètre user éventuel est ignoré).
export async function logSession({ startedAt, endedAt, mode, intention, interrupted = false }) {
  try {
    const data = await api('/api/sessions', {
      method: 'POST',
      body: { startedAt, endedAt, mode, intention, interrupted }
    });
    return data?.session || null;
  } catch (e) {
    console.error('logSession error', e);
    return null;
  }
}

export async function updateSessionRating(id, rating) {
  try {
    const data = await api(`/api/sessions/${id}`, { method: 'PATCH', body: { rating: rating ?? null } });
    return data?.session || null;
  } catch (e) {
    console.error('updateSessionRating error', e);
    return null;
  }
}

// Le paramètre user est conservé pour compatibilité mais ignoré.
export async function fetchRecentStats(user, { days = 7, includeAllDaily = false, limitSessions = 200 } = {}) {
  const params = new URLSearchParams();
  if (typeof days === 'number' && days > 0) params.set('days', String(days));
  if (includeAllDaily) params.set('allDaily', '1');
  if (limitSessions) params.set('limitSessions', String(limitSessions));
  const query = params.toString();

  try {
    return await api(`/api/stats${query ? `?${query}` : ''}`);
  } catch (e) {
    console.error('fetchRecentStats error', e);
    return { sessions: [], daily: [], allDaily: [] };
  }
}
