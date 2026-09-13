// Utilitaires d'analyse & gamification, fonctions pures (aucun effet de bord).
// Formes attendues :
//   session: { started_at: ISOString, ended_at: ISOString, duration_seconds: number, mode: 'pomodoro'|'break' }
//   daily: { day: 'YYYY-MM-DD', focus_seconds: number, pomodoro_count?: number }

export function computeConsistency(daily, rangeDays) {
  if (!rangeDays || rangeDays <=0) return 0;
  // Build a map day -> focus_seconds for quick lookup
  const map = new Map();
  (daily||[]).forEach(d=>{ if (d && d.day) map.set(d.day, d.focus_seconds||0); });
  let active=0;
  for (let i=0;i<rangeDays;i++) {
    const key = new Date(Date.now() - i*86400000).toISOString().slice(0,10);
    if ((map.get(key)||0) > 0) active++;
  }
  return Math.round((active / rangeDays)*100) || 0;
}

export function computeLongestStreak(daily) {
  const days = [...new Set((daily||[]).filter(d=>d.focus_seconds>0).map(d=>d.day))].sort();
  if (!days.length) return 0;
  let longest=1, current=1;
  for (let i=1;i<days.length;i++) {
    const prev = days[i-1];
    const cur = days[i];
    if (isConsecutive(prev, cur)) {
      current++;
    } else {
      if (current>longest) longest=current;
      current=1;
    }
  }
  return Math.max(longest, current);
}

export function computeStreak(daily) {
  // Current streak ending today.
  const positiveSet = new Set((daily||[]).filter(d=>d.focus_seconds>0).map(d=>d.day));
  let streak = 0;
  for (let i=0; ; i++) {
    const key = new Date(Date.now() - i*86400000).toISOString().slice(0,10);
    if (positiveSet.has(key)) streak++; else break;
  }
  return streak;
}

function isConsecutive(a, b) {
  // a,b strings YYYY-MM-DD
  const da = new Date(a+"T00:00:00Z");
  const db = new Date(b+"T00:00:00Z");
  return (db - da) === 86400000; // exactly one day diff
}

export function computeLevel(totalFocusMinutes) {
  // Simple exponential leveling: level 1 at 0, 2 at 150, 3 at 400, etc.
  let level = 1;
  let requirement = 0;
  while (true) {
    const needed = Math.round(150 * Math.pow(1.4, level-1));
    if (totalFocusMinutes < requirement + needed) {
      return { level, current: totalFocusMinutes - requirement, needed, progress: (totalFocusMinutes - requirement) / needed };
    }
    requirement += needed;
    level++;
    if (level>50) return { level:50, current:0, needed:0, progress:1 };
  }
}

export function buildMonthMatrix(sessions, year, month) {
  const now = new Date();
  const targetYear = year ?? now.getFullYear();
  const targetMonth = month ?? now.getMonth();
  const first = new Date(targetYear, targetMonth, 1);
  // FIX: previous version used the raw params (possibly undefined) leading to Invalid Date.
  const daysInMonth = new Date(targetYear, targetMonth + 1, 0).getDate();
  const map = {};
  sessions.filter(s=>s.mode==='pomodoro').forEach(s=>{
    const d = new Date(s.started_at);
    if (d.getFullYear()===targetYear && d.getMonth()===targetMonth) {
      const key = d.getDate();
      map[key] = (map[key]||0) + (s.duration_seconds||0);
    }
  });
  const weeks = [];
  let week = new Array(first.getDay()).fill(null);
  for (let day=1; day<=daysInMonth; day++) {
    week.push({ day, seconds: map[day]||0 });
    if (week.length===7) { weeks.push(week); week=[]; }
  }
  if (week.length) { while(week.length<7) week.push(null); weeks.push(week); }
  const labelDate = new Date(targetYear, targetMonth, 1);
  return { weeks, monthLabel: labelDate.toLocaleString(undefined,{ month:'long', year:'numeric'}), totalSeconds: Object.values(map).reduce((a,b)=>a+b,0), year: targetYear, month: targetMonth };
}

export function buildMonthMatrixFromDaily(daily, year, month) {
  const sessions = (daily || []).map(entry => ({
    started_at: `${entry.day}T12:00:00Z`,
    mode: 'pomodoro',
    duration_seconds: entry.focus_seconds || 0,
  }));
  return buildMonthMatrix(sessions, year, month);
}
