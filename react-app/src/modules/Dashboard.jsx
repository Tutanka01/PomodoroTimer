import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from './useAuth.js';
import { useTheme } from './useTheme.js';
import { fetchRecentStats } from './sessionStore.js';
import { computeConsistency, computeLongestStreak, computeLevel, buildMonthMatrix, computeStreak } from './statsUtils.js';
import { ThemeToggle } from './ThemeToggle.jsx';
import { supabase } from './supabaseClient.js';
import { getUserPreferences, upsertUserPreferences } from './userPrefs.js';

export function DashboardPage() {
  const nav = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const [range, setRange] = useState(7);
  const [showAdvanced, setShowAdvanced] = useState(true);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ sessions: [], daily: [] });
  const [error, setError] = useState(null);
  const [lifetime, setLifetime] = useState({ loading: true, totalFocusMin: 0, totalSessions: 0, focusDays: 0, longestStreak: 0, currentStreak: 0 });
  const [prefs, setPrefs] = useState({ daily_focus_goal_min: 120 });
  const [savingGoal, setSavingGoal] = useState(false);
  const [compareRange, setCompareRange] = useState({ current: [], previous: [], deltaMinutes: 0, percent: 0 });

  const load = useCallback(async () => {
    if (!user) return; setLoading(true); setError(null);
    const data = await fetchRecentStats(user, { days: range });
    setStats(data); setLoading(false);
  }, [user, range]);

  // Lifetime stats (separate heavier query to avoid blocking main load)
  const loadLifetime = useCallback(async () => {
    if (!user) return;
    try {
  // Fetch up to 1000 days of aggregated history (enough for > 2 years)
      const { data: allDaily, error: dailyErr } = await supabase
        .from('user_daily_focus')
        .select('*')
        .order('day', { ascending: false })
        .limit(1000);
      if (dailyErr) throw dailyErr;
      const totalFocusSeconds = (allDaily||[]).reduce((a,d)=>a+(d.focus_seconds||0),0);
      const totalSessions = (allDaily||[]).reduce((a,d)=>a+(d.pomodoro_count||0),0);
      const focusDays = (allDaily||[]).length;
      const longestStreak = computeLongestStreak(allDaily||[]);
      const currentStreak = computeStreak(allDaily||[]);
      setLifetime({ loading:false, totalFocusMin: Math.round(totalFocusSeconds/60), totalSessions, focusDays, longestStreak, currentStreak });
    } catch(e){
      console.error(e);
      setLifetime(l=>({ ...l, loading:false }));
    }
  }, [user]);

  // Redirect only once auth finished and user is not logged in
  useEffect(()=> { if (!authLoading && !user) nav('/login'); }, [authLoading, user, nav]);
  useEffect(()=> { if (!authLoading && user) { load(); loadLifetime(); loadPrefs(); } }, [authLoading, user, load, loadLifetime]);

  const loadPrefs = useCallback(async ()=>{
    if (!user) return; const p = await getUserPreferences(user); setPrefs(p);
  }, [user]);

  const safe = stats || { sessions: [], daily: [] };
  const totalFocusSec = safe.sessions.filter(s=>s.mode==='pomodoro').reduce((a,s)=>a+(s.duration_seconds||0),0); // sur la fenêtre "range"
  const totalFocusMin = Math.round(totalFocusSec/60);
  const todayStr = new Date().toISOString().slice(0,10);
  const todaySessions = safe.sessions.filter(s=>s.mode==='pomodoro' && (s.started_at||'').startsWith(todayStr));
  const todayFocusMin = Math.round(todaySessions.reduce((a,s)=>a+(s.duration_seconds||0),0)/60);
  const todayPomodoros = todaySessions.length;
  const streak = lifetime.currentStreak; // use lifetime streak for consistency
  const pomos = safe.sessions.filter(s=>s.mode==='pomodoro');
  const avgPomodoroLength = averageLength(pomos);
  const focusRatio = buildFocusRatio(safe.sessions);
  const consistency = computeConsistency(safe.daily, range);
  const longestStreak = lifetime.longestStreak || computeLongestStreak(safe.daily);
  const levelInfo = computeLevel(totalFocusMin);
  const [monthOffset, setMonthOffset] = useState(0); // 0 = current month, -1 = prev, +1 = next
  const baseDate = new Date();
  const viewDate = new Date(baseDate.getFullYear(), baseDate.getMonth()+monthOffset, 1);
  const monthMatrix = buildMonthMatrix(safe.sessions, viewDate.getFullYear(), viewDate.getMonth());

  const DAILY_GOAL_MIN = prefs.daily_focus_goal_min || 120;
  const goalProgress = Math.min(1, todayFocusMin / DAILY_GOAL_MIN);

  // Current week vs previous week comparison (always last rolling 7 days for clarity)
  useEffect(()=>{
    if (!stats.daily?.length) return;
    const now = new Date();
    function dayKey(offset){ return new Date(now.getTime() - offset*86400000).toISOString().slice(0,10); }
    const last7 = Array.from({length:7},(_,i)=> dayKey(i)).reverse();
    const prev7 = Array.from({length:7},(_,i)=> dayKey(i+7)).reverse();
    const map = Object.fromEntries(stats.daily.map(d=>[d.day,d]));
    const sum = (arr)=> arr.reduce((a,d)=> a + (map[d]?.focus_seconds||0),0);
    const curSum = sum(last7); const prevSum = sum(prev7);
    const delta = curSum - prevSum;
    const pct = prevSum? (delta/prevSum)*100 : 0;
    setCompareRange({ current:last7, previous:prev7, deltaMinutes: Math.round(delta/60), percent: Math.round(pct) });
  }, [stats.daily]);

  // During auth resolution show neutral screen (avoid flicker)
  if (authLoading) {
    return (
      <div className={`min-h-screen flex flex-col items-center justify-center ${isDark?'theme-night':'theme-day'}`}> 
        <div className="animate-pulse text-sm opacity-60">Loading...</div>
      </div>
    );
  }

  if (!user) return null; // redirection imminente

  return (
    <div className={`min-h-screen flex flex-col ${isDark?'theme-night':'theme-day'} transition-colors`}> 
      <Header nav={nav} toggleTheme={toggleTheme} isDark={isDark} />
      <main className="flex-1 px-5 sm:px-10 pb-20 max-w-7xl w-full mx-auto">
        <section className="mt-4 flex flex-wrap gap-4 items-center justify-between dashboard-topbar">
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-semibold tracking-tight flex items-center gap-3">
              <span className="bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 via-sky-400 to-indigo-400 drop-shadow-sm">Dashboard</span>
              <span aria-label="Version Beta" title="Version Beta" className="beta-badge">Beta+</span>
            </h1>
            <div className="hidden md:flex gap-2 bg-white/10 dark:bg-white/5 rounded-full p-1 switch-range" role="radiogroup" aria-label="Plage statistiques">
              {[7,14,30].map(d => (
                <button key={d} role="radio" aria-checked={range===d} onClick={()=>setRange(d)} className={`px-3 py-1 rounded-full text-[11px] font-medium transition-all ${range===d? 'active-range':'inactive-range'}`}>{d}j</button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="md:hidden flex gap-1" aria-hidden="true">
              {[7,14,30].map(d => (
                <button key={d} onClick={()=>setRange(d)} className={`px-2 py-1 rounded-md text-[10px] font-medium transition-all ${range===d? 'active-range-sm':'inactive-range-sm'}`}>{d}</button>
              ))}
            </div>
            <button className="share-btn hidden sm:inline-flex" title="Share your progress (coming soon)">Share</button>
            <button onClick={()=>setShowAdvanced(s=>!s)} className="text-[10px] px-3 py-1 rounded-full bg-white/10 hover:bg-white/20 transition-colors uppercase tracking-wide">{showAdvanced? 'Réduire':'Tout afficher'}</button>
          </div>
        </section>

        {/* GRID PRINCIPALE NOUVELLE STRUCTURE */}
        <div className="mt-10 grid gap-7 xl:grid-cols-12 auto-rows-min dashboard-grid">
          <TodayFocusPanel loading={loading} todayFocusMin={todayFocusMin} todayPomodoros={todayPomodoros} goal={DAILY_GOAL_MIN} goalProgress={goalProgress} avgPomodoroLength={avgPomodoroLength} onGoalChange={async (val)=>{ setSavingGoal(true); await upsertUserPreferences(user,{ daily_focus_goal_min: val}); await loadPrefs(); setSavingGoal(false); }} savingGoal={savingGoal} />
          <StreaksPanel loading={loading || lifetime.loading} current={streak} longest={longestStreak} consistency={consistency} range={range} goalAchieved={goalProgress>=1} />
          <InsightsPanel loading={loading} focusRatio={focusRatio} avgPomodoroLength={avgPomodoroLength} compareRange={compareRange} levelInfo={levelInfo} />
          {showAdvanced && <MonthCalendar matrix={monthMatrix} loading={loading} onPrev={()=>setMonthOffset(o=>o-1)} onNext={()=>setMonthOffset(o=>o+1)} offset={monthOffset} />}
          <section className="panel relative rounded-2xl p-5 xl:col-span-8 order-5 enhanced-panel" aria-labelledby="timelineHeading">
            <div className="mini-grid-bg" />
            <h2 id="timelineHeading" className="sr-only">Timeline focus</h2>
            <ChartsSection loading={loading} daily={safe.daily} range={range} compare={compareRange} />
          </section>
          {showAdvanced && <section className="panel relative rounded-2xl p-5 xl:col-span-4 order-6 enhanced-panel" aria-labelledby="lifetimeHeading">
            <div className="mini-grid-bg" />
            <h2 id="lifetimeHeading" className="sr-only">Progression & bilan global</h2>
            <LevelProgress info={levelInfo} />
            <div className="separator-line" />
            <LifetimePanel lifetime={lifetime} />
          </section>}
          {showAdvanced && <section className="xl:col-span-12 order-7"><RecentSessions loading={loading} sessions={safe.sessions} /></section>}
        </div>
      </main>
      <footer className="text-center py-6 text-xs opacity-50">Crafted for deep focus · {user?.email}</footer>
    </div>
  );
}

function Header({ nav, toggleTheme, isDark }) {
  return (
    <header className="px-5 sm:px-10 py-5 flex items-center justify-between backdrop-blur-md">
      <div className="flex items-center gap-4">
        <button onClick={()=>nav('/')} className="text-xs opacity-70 hover:opacity-100">← Back</button>
      </div>
      <div className="flex items-center gap-4">
        <ThemeToggle isDark={isDark} toggle={toggleTheme} />
      </div>
    </header>
  );
}

function MetricCard({ label, value, accent }) {
  return (
    <div className={`metric-card ${accent? 'accent':''}`}>
      <div className="metric-label">{label}</div>
      <div className="metric-value tabular-nums">{value}</div>
    </div>
  );
}

// --- Nouveaux panneaux ---
function TodayFocusPanel({ loading, todayFocusMin, todayPomodoros, goal, goalProgress, avgPomodoroLength, onGoalChange, savingGoal }) {
  const pct = Math.round(goalProgress*100);
  return (
    <section className="panel relative rounded-2xl p-5 flex flex-col gap-5 lg:col-span-4 order-1">
      <div className="mini-grid-bg" />
  <h2 className="text-sm uppercase tracking-wide opacity-60">Today</h2>
      <div className="flex items-center gap-6">
        <div className="focus-ring-wrapper">
          <div className="focus-ring" style={{ background: `conic-gradient(var(--ring-accent) ${pct}%, var(--ring-bg) ${pct}% 100%)` }}>
            <div className="inner">{loading? '…' : todayFocusMin}<span className="unit">m</span></div>
            <div className="goal-label">{pct}%</div>
          </div>
        </div>
        <div className="flex-1 grid grid-cols-2 gap-4 text-xs">
          <div className="stat-mini"><span className="lbl">Sessions</span><span className="val">{loading? '…': todayPomodoros}</span></div>
          <div className="stat-mini"><span className="lbl">Goal</span><span className="val">{goal}m</span></div>
          <div className="stat-mini"><span className="lbl">Moy. Pomodoro</span><span className="val">{loading? '…': avgPomodoroLength}m</span></div>
          <div className="stat-mini"><span className="lbl">Restant</span><span className="val">{Math.max(0, goal - todayFocusMin)}m</span></div>
        </div>
      </div>
      <p className="text-[11px] leading-snug opacity-60">
  {goalProgress>=1 ? 'Daily goal reached. Habit bonus secured ✅' : `Reach ${goal} min to secure your streak.`}
      </p>
      <GoalEditor current={goal} onChange={onGoalChange} saving={savingGoal} />
    </section>
  );
}

function GoalEditor({ current, onChange, saving }) {
  const [val,setVal] = useState(current);
  useEffect(()=>{ setVal(current); }, [current]);
  return (
    <div className="flex items-center gap-2 text-[11px] flex-wrap">
  <span className="opacity-60 uppercase tracking-wide">Daily goal</span>
      <input type="number" min={15} step={15} value={val} onChange={e=>setVal(e.target.value)} className="goal-input" />
  <button disabled={saving || val==current} onClick={()=>onChange(Number(val)||current)} className="goal-save-btn disabled:opacity-40 disabled:cursor-not-allowed">{saving? '...':'Save'}</button>
    </div>
  );
}

function StreaksPanel({ loading, current, longest, consistency, range, goalAchieved }) {
  return (
    <section className="panel relative rounded-2xl p-5 flex flex-col gap-5 lg:col-span-4 order-2">
      <div className="mini-grid-bg" />
      <h2 className="text-sm uppercase tracking-wide opacity-60">Streaks</h2>
      <div className="grid grid-cols-2 gap-4">
        <div className="streak-box">
          <span className="lbl">Streak actuel</span>
          <span className="big-val">{loading? '…': current}</span>
          <span className="sm-note">days</span>
        </div>
        <div className="streak-box">
          <span className="lbl">Best</span>
            <span className="big-val">{loading? '…': longest}</span>
          <span className="sm-note">days</span>
        </div>
        <div className="streak-box">
          <span className="lbl">Consistance</span>
          <span className="big-val">{loading? '…': consistency+'%'}</span>
          <span className="sm-note">sur {range}j</span>
        </div>
        <div className="streak-box">
          <span className="lbl">Safety</span>
          <span className={`badge ${goalAchieved? 'ok':'pending'}`}>{goalAchieved? 'OK':'In progress'}</span>
          <span className="sm-note">daily goal</span>
        </div>
      </div>
  <p className="text-[11px] leading-snug opacity-60">Keep your streak by hitting the daily goal. Consistency beats intensity.</p>
    </section>
  );
}

// Nouveau panneau Overview combinant Today + Streak + meta stats
// Nouveau panneau d'insights isolé
function InsightsPanel({ loading, focusRatio, avgPomodoroLength, compareRange, levelInfo }) {
  const deltaLabel = compareRange?.deltaMinutes>=0 ? '+'+compareRange.deltaMinutes : compareRange.deltaMinutes;
  const deltaPct = compareRange?.percent>=0 ? '+'+compareRange.percent : compareRange.percent;
  return (
    <section className="panel relative rounded-2xl p-5 xl:col-span-4 order-3 insights-panel" aria-label="Insights">
      <div className="mini-grid-bg" />
      <h2 className="text-sm uppercase tracking-wide opacity-60 mb-4">Insights</h2>
      <div className="simple-chip-grid">
        <div className="simple-chip">
          <span className="lbl">Focus Ratio</span>
          <span className="val">{loading? '…': focusRatio+'%'}<span className="sub">deep</span></span>
        </div>
        <div className="simple-chip">
          <span className="lbl">Avg Length</span>
          <span className="val">{loading? '…': avgPomodoroLength+'m'}<span className="sub">pomodoro</span></span>
        </div>
        <div className={`simple-chip ${compareRange.deltaMinutes>=0? 'pos':'neg'}`}> 
          <span className="lbl">Weekly Δ</span>
          <span className="val">{loading? '…': deltaLabel+'m'}<span className={`sub ${compareRange.percent>=0? 'pos':'neg'}`}>{deltaPct}%</span></span>
        </div>
        <div className="simple-chip level">
          <span className="lbl">Level</span>
          <span className="val">{levelInfo?.level||0}<span className="sub">{Math.round((levelInfo?.progress||0)*100)}%</span></span>
        </div>
      </div>
      {levelInfo && (
        <div className="mt-6">
          <div className="flex justify-between text-[10px] font-medium opacity-70 mb-2"><span>Level {levelInfo.level}</span><span>{Math.round(levelInfo.progress*100)}%</span></div>
          <div className="h-2 rounded-full bg-white/10 overflow-hidden level-mini-track">
            <div className="h-full level-mini-fill" style={{ width: `${Math.min(100, levelInfo.progress*100)}%`}} />
          </div>
          <div className="text-[10px] opacity-50 mt-2">Next in {levelInfo.needed - levelInfo.current} min</div>
        </div>
      )}
    </section>
  );
}

function LifetimePanel({ lifetime }) {
  return (
    <div className="lifetime-grid">
      <h3 className="text-xs uppercase tracking-wide opacity-60 mb-3">Bilan Global</h3>
      <div className="grid grid-cols-3 gap-3 text-center text-[11px]">
        <div className="life-box">
          <span className="val">{lifetime.loading? '…': lifetime.totalFocusMin}</span>
          <span className="lbl">min focus</span>
        </div>
        <div className="life-box">
          <span className="val">{lifetime.loading? '…': lifetime.totalSessions}</span>
          <span className="lbl">sessions</span>
        </div>
        <div className="life-box">
          <span className="val">{lifetime.loading? '…': lifetime.focusDays}</span>
          <span className="lbl">active days</span>
        </div>
        <div className="life-box col-span-3 mt-2">
          <span className="val text-base">🔥 {lifetime.loading? '…': lifetime.longestStreak} j</span>
          <span className="lbl">best streak</span>
        </div>
      </div>
    </div>
  );
}

function ChartsSection({ loading, daily, range, compare }) {
  const days = buildLast(range);
  const max = Math.max(1, ...daily.map(d=>d.focus_seconds));
  return (
    <div>
  <h2 className="text-sm uppercase tracking-wide opacity-60 mb-4">Timeline (Last {range} Days)</h2>
      <div className="flex gap-2 items-end h-40">
        {days.map(d => {
          const rec = daily.find(r=>r.day===d);
          const value = rec? rec.focus_seconds : 0;
          const h = Math.round((value / max) * 100);
          return (
            <div key={d} className="flex-1 flex flex-col items-center">
              <div className="w-full max-w-[26px] h-full rounded-xl bg-white/5 dark:bg-white/10 relative overflow-hidden">
                <div className="absolute bottom-0 left-0 w-full bg-gradient-to-t from-pink-500 to-indigo-500 transition-all duration-700" style={{ height: loading? '0%' : h+'%' }} />
              </div>
              <span className="mt-2 text-[10px] opacity-60">{d.slice(5)}</span>
            </div>
          );
        })}
      </div>
      {compare.current.length===7 && (
        <div className="mt-6 flex flex-wrap items-center gap-4 text-[11px] comparison-bar">
          <span className="opacity-60 uppercase tracking-wide">Weekly Comparison</span>
          <span className={`delta ${compare.deltaMinutes>=0? 'pos':'neg'}`}>{compare.deltaMinutes>=0? '+':''}{compare.deltaMinutes} min</span>
          <span className={`delta ${compare.percent>=0? 'pos':'neg'}`}>{compare.percent>=0? '+':''}{compare.percent}%</span>
          <span className="opacity-40">vs previous 7 days</span>
        </div>
      )}
    </div>
  );
}

function LevelProgress({ info }) {
  if (!info) return null;
  return (
    <div className="mt-10 panel">
      <div className="mini-grid-bg" />
      <h2 className="text-sm uppercase tracking-wide opacity-60 mb-3">Level Progress</h2>
      <div>
        <div className="flex justify-between text-xs opacity-70 mb-2"><span>Level {info.level}</span><span>{Math.round(info.progress*100)}%</span></div>
        <div className="h-3 rounded-full bg-white/10 overflow-hidden">
          <div className="h-full bg-gradient-to-r from-pink-500 to-indigo-500 transition-all" style={{ width: `${Math.min(100, info.progress*100)}%`}} />
        </div>
        <div className="text-[10px] opacity-50 mt-2">Next level in {info.needed - info.current} min</div>
      </div>
    </div>
  );
}

function MonthCalendar({ matrix, loading, onPrev, onNext, offset }) {
  if (!matrix) return null;
  const max = matrix.weeks.flat().filter(Boolean).reduce((m,c)=>Math.max(m,c.seconds),0) || 1;
  return (
    <section className="panel relative rounded-2xl p-5 lg:col-span-4 order-3">
      <div className="mini-grid-bg" />
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <button onClick={onPrev} className="nav-chip">←</button>
          <h2 className="text-sm uppercase tracking-wide opacity-70">{matrix.monthLabel}</h2>
          <button onClick={onNext} className="nav-chip">→</button>
        </div>
        <span className="text-[10px] opacity-50">{Math.round(matrix.totalSeconds/60)} min</span>
      </div>
      <div className="space-y-1">
        {matrix.weeks.map((w,i)=>(
          <div key={i} className="grid grid-cols-7 gap-1">
            {w.map((cell,j)=>{
              if(!cell) return <div key={j} className="h-7 rounded-md bg-transparent" />;
              const ratio = cell.seconds / max;
              return (
                <div key={j} title={`${cell.day} • ${Math.round(cell.seconds/60)} min`} className="h-7 rounded-md relative overflow-hidden calendar-cell">
                  <div className="absolute inset-0" style={{ background: ratio? `linear-gradient(135deg, rgba(6,182,212,${0.15+0.55*ratio}), rgba(99,102,241,${0.15+0.55*ratio}))`: 'transparent' }} />
                  <span className="absolute inset-0 flex items-center justify-center text-[10px] font-medium opacity-80 mix-blend-luminosity">{cell.day}</span>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </section>
  );
}

function RecentSessions({ loading, sessions }) {
  return (
    <section className="mt-14 mb-10">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-sm uppercase tracking-wide opacity-60">Recent Sessions</h2>
        <span className="text-[10px] opacity-50">Latest {Math.min(25, sessions.length)}</span>
      </div>
      <div className="border border-white/10 rounded-2xl overflow-hidden">
        <div className="grid grid-cols-5 text-[10px] uppercase tracking-wide opacity-60 px-4 py-2 bg-white/5 dark:bg-white/10">
          <span>Mode</span><span>Start</span><span>End</span><span>Dur (m)</span><span>Intention</span>
        </div>
        <div className="max-h-72 overflow-auto thin-scroll">
          {loading && <SkeletonRows />}
          {!loading && sessions.slice(0,25).map(s => (
            <div key={s.id} className="grid grid-cols-5 text-xs px-4 py-2 odd:bg-white/2 even:bg-transparent hover:bg-white/10 transition-colors">
              <span className="font-medium capitalize">{s.mode}</span>
              <span className="opacity-70 tabular-nums">{formatClock(s.started_at)}</span>
              <span className="opacity-70 tabular-nums">{formatClock(s.ended_at)}</span>
              <span className="opacity-70">{Math.round(s.duration_seconds/60)}</span>
              <span className="truncate opacity-70" title={s.intention || ''}>{s.intention || '—'}</span>
            </div>
          ))}
          {!loading && sessions.length===0 && (
            <div className="px-4 py-6 text-xs opacity-60 text-center">No sessions yet.</div>
          )}
        </div>
      </div>
    </section>
  );
}

function SkeletonRows() {
  return Array.from({ length: 8 }).map((_,i)=>(
    <div key={i} className="grid grid-cols-5 px-4 py-2 animate-pulse">
      {Array.from({length:5}).map((_,j)=>(<span key={j} className="h-3 rounded bg-white/10" />))}
    </div>
  ));
}

function buildLast(n) {
  const arr = []; for(let i=n-1;i>=0;i--){ arr.push(new Date(Date.now()-i*24*3600*1000).toISOString().slice(0,10)); } return arr;
}
function averageLength(pomos) { if(!pomos.length) return 0; return Math.round(pomos.reduce((a,s)=>a+s.duration_seconds,0)/(pomos.length*60)); }
function buildFocusRatio(all){ if(!all.length) return 0; const focus=all.filter(s=>s.mode==='pomodoro').reduce((a,s)=>a+s.duration_seconds,0); const total=all.reduce((a,s)=>a+s.duration_seconds,0); return Math.round((focus/total)*100)||0; }
function formatClock(ts){ if(!ts) return ''; const d=new Date(ts); return d.toLocaleTimeString([], { hour: '2-digit', minute:'2-digit'}); }
