// Utility functions for advanced analytics & gamification

export function computeHourlyHistogram(sessions) {
  const hours = Array.from({length:24},()=>0);
  sessions.filter(s=>s.mode==='pomodoro').forEach(s=>{
    const d = new Date(s.started_at);
    hours[d.getHours()] += s.duration_seconds || 0;
  });
  return hours; // seconds per hour
}

export function computeConsistency(daily, rangeDays) {
  const activeDays = daily.filter(d=>d.focus_seconds>0).length;
  return Math.round((activeDays / rangeDays) * 100) || 0;
}

export function computeLongestStreak(daily) {
  const set = new Set(daily.filter(d=>d.focus_seconds>0).map(d=>d.day));
  let longest=0,current=0,day=0;
  while(true){
    const date = new Date();
    date.setDate(date.getDate()-day);
    const key = date.toISOString().slice(0,10);
    if (set.has(key)) { current++; } else { longest = Math.max(longest,current); current=0; }
    if (day>400) break; // safety
    day++;
    if (day> set.size + 50) break;
  }
  return Math.max(longest,current);
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

export function deriveBadges({ totalFocusMin, streak, longestStreak, pomodoroCount }) {
  const badges = [];
  if (totalFocusMin >= 100) badges.push({ id:'100min', label:'100m Focus' });
  if (totalFocusMin >= 1000) badges.push({ id:'1000min', label:'1000m Focus' });
  if (streak >= 3) badges.push({ id:'streak3', label:'3 Day Streak' });
  if (streak >= 7) badges.push({ id:'streak7', label:'7 Day Streak' });
  if (longestStreak >= 14) badges.push({ id:'streak14', label:'14 Day Streak' });
  if (pomodoroCount >= 50) badges.push({ id:'50pomo', label:'50 Pomodoros' });
  if (pomodoroCount >= 200) badges.push({ id:'200pomo', label:'200 Pomodoros' });
  return badges;
}

export function buildMonthMatrix(sessions, year, month) {
  const now = new Date();
  const targetYear = year ?? now.getFullYear();
  const targetMonth = month ?? now.getMonth();
  const first = new Date(targetYear, targetMonth, 1);
  const daysInMonth = new Date(year, month+1, 0).getDate();
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
