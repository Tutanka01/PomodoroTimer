import { api } from './api.js';

const DEFAULT_PREFS = { daily_focus_goal_min: 120 };

// Le paramètre user est toléré pour compatibilité mais ignoré.
export async function getUserPreferences(user) {
  try {
    const data = await api('/api/prefs');
    if (!data || typeof data.daily_focus_goal_min !== 'number') return { ...DEFAULT_PREFS };
    return data;
  } catch (e) {
    console.error('getUserPreferences error', e);
    return { ...DEFAULT_PREFS };
  }
}

export async function upsertUserPreferences(user, { daily_focus_goal_min }) {
  try {
    await api('/api/prefs', { method: 'PUT', body: { daily_focus_goal_min } });
  } catch (e) {
    console.error('upsertUserPreferences error', e);
  }
}
