import { api } from './api.js';

const OUTBOX_KEY = 'flow-outbox';

function readOutbox() {
  try {
    const list = JSON.parse(localStorage.getItem(OUTBOX_KEY));
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function writeOutbox(list) {
  try {
    localStorage.setItem(OUTBOX_KEY, JSON.stringify(list.slice(-50)));
  } catch {
    // quota indisponible : on n'insiste pas
  }
}

async function postSession(payload) {
  const data = await api('/api/sessions', { method: 'POST', body: payload });
  return data?.session || null;
}

// Enregistre une session terminée. En cas d'échec réseau/serveur, la session est
// conservée localement et renvoyée automatiquement (voir flushOutbox).
export async function logSession({ startedAt, endedAt, mode, intention, interrupted = false }) {
  const payload = { startedAt, endedAt, mode, intention, interrupted };
  try {
    return await postSession(payload);
  } catch (e) {
    console.error('logSession error — session mise en attente', e);
    writeOutbox([...readOutbox(), payload]);
    return null;
  }
}

export function pendingSessionCount() {
  return readOutbox().length;
}

// Renvoie les sessions en attente. Retourne le nombre restant.
export async function flushOutbox() {
  const list = readOutbox();
  if (!list.length) return 0;
  const remaining = [];
  for (const payload of list) {
    try {
      await postSession(payload);
    } catch {
      remaining.push(payload);
    }
  }
  writeOutbox(remaining);
  return remaining.length;
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
// L'erreur remonte volontairement : le dashboard affiche sa bannière « Recharger ».
export async function fetchRecentStats(user, { days = 7, includeAllDaily = false, limitSessions = 200 } = {}) {
  const params = new URLSearchParams();
  if (typeof days === 'number' && days > 0) params.set('days', String(days));
  if (includeAllDaily) params.set('allDaily', '1');
  if (limitSessions) params.set('limitSessions', String(limitSessions));
  const query = params.toString();
  return api(`/api/stats${query ? `?${query}` : ''}`);
}
