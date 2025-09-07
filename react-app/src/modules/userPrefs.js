import { supabase } from './supabaseClient.js';

export async function getUserPreferences(user) {
  if (!user) return { daily_focus_goal_min: 120 };
  const { data, error } = await supabase.from('user_preferences').select('*').eq('user_id', user.id).single();
  if (error && error.code !== 'PGRST116') { // not found vs real error
    console.error('getUserPreferences error', error);
  }
  if (!data) return { daily_focus_goal_min: 120 };
  return data;
}

export async function upsertUserPreferences(user, { daily_focus_goal_min }) {
  if (!user) return;
  const { error } = await supabase.from('user_preferences').upsert({ user_id: user.id, daily_focus_goal_min });
  if (error) console.error('upsertUserPreferences error', error);
}
