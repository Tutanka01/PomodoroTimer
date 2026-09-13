import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from './useAuth.js';
import { useTheme } from './useTheme.js';
import { fetchRecentStats } from './sessionStore.js';
import { computeConsistency, computeLongestStreak, computeLevel, buildMonthMatrixFromDaily, computeStreak } from './statsUtils.js';
import { ThemeToggle } from './ThemeToggle.jsx';
import { getUserPreferences, upsertUserPreferences } from './userPrefs.js';

const RANGE_PRESETS = [
  { key: '7', label: 'Last 7 days', short: '7j', description: 'Recent focus rhythm' },
  { key: '30', label: 'Last 30 days', short: '30j', description: 'Monthly cadence' },
  { key: '90', label: 'Last 90 days', short: '90j', description: 'Quarter overview' },
  { key: '365', label: 'Last 12 months', short: '1 an', description: 'Year in review' },
  { key: 'lifetime', label: 'Since day one', short: '∞', description: 'Full history' }
];

const DEFAULT_RANGE = 'lifetime';
const MAX_TIMELINE_POINTS = 120;

export function DashboardPage() {
  const nav = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const [range, setRange] = useState(DEFAULT_RANGE);
  const [showAdvanced, setShowAdvanced] = useState(true);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ sessions: [], daily: [], allDaily: [] });
  const [error, setError] = useState(null);
  const [prefs, setPrefs] = useState({ daily_focus_goal_min: 120 });
  const [savingGoal, setSavingGoal] = useState(false);

  useEffect(() => {
    const stored = typeof window !== 'undefined' ? window.localStorage.getItem('dashboard-range') : null;
    if (stored && stored !== range && RANGE_PRESETS.some(opt => opt.key === stored)) {
      setRange(stored);
    }
    // We intentionally omit `range` from deps to avoid overwriting selection after first render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem('dashboard-range', range);
  }, [range]);
  const loadPrefs = useCallback(async () => {
    if (!user) return;
    const p = await getUserPreferences(user);
    setPrefs(p);
  }, [user]);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const numericCandidate = Number(range);
      const queryDays = range === 'lifetime' || !Number.isFinite(numericCandidate) ? null : Math.max(1, Math.floor(numericCandidate));
      const sessionCap = queryDays ? Math.min(600, Math.max(150, queryDays * 12)) : 800;
      const data = await fetchRecentStats(user, { days: queryDays ?? null, includeAllDaily: true, limitSessions: sessionCap });
      setStats({
        sessions: data.sessions || [],
        daily: data.daily || [],
        allDaily: data.allDaily || data.daily || [],
      });
    } catch (err) {
      console.error(err);
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [user, range]);

  // Redirect only once auth finished and user is not logged in
  useEffect(()=> { if (!authLoading && !user) nav('/login'); }, [authLoading, user, nav]);
  useEffect(()=> { if (!authLoading && user) { load(); loadPrefs(); } }, [authLoading, user, load, loadPrefs]);

  const normalizedDaily = useMemo(() => normalizeDaily(stats.allDaily?.length ? stats.allDaily : stats.daily), [stats]);
  const rangeWindow = useMemo(() => computeRangeWindow(range, normalizedDaily), [range, normalizedDaily]);
  const expandedDaily = rangeWindow.expanded;
  const rangeSummary = useMemo(() => summarizeRange(expandedDaily), [expandedDaily]);
  const lifetime = useMemo(() => summarizeLifetime(normalizedDaily, loading), [normalizedDaily, loading]);
  const compareRange = useMemo(() => buildWeeklyComparison(normalizedDaily), [normalizedDaily]);
  const timeline = useMemo(() => buildTimelineSeries(expandedDaily), [expandedDaily]);
  const timelineSeries = timeline.series;
  const timelineGranularity = timeline.granularity;

  const consistencyDays = Math.max(1, Math.min(rangeWindow.daySpan, 90));
  const consistencySlice = expandedDaily.slice(-consistencyDays);
  const consistency = computeConsistency(consistencySlice, consistencyDays);
  const longestStreak = lifetime.longestStreak;
  const streak = lifetime.currentStreak;
  const levelInfo = useMemo(() => computeLevel(lifetime.totalFocusMin || 0), [lifetime.totalFocusMin]);
  const [monthOffset, setMonthOffset] = useState(0); // 0 = current month, -1 = prev, +1 = next
  const baseDate = new Date();
  const viewDate = new Date(baseDate.getFullYear(), baseDate.getMonth()+monthOffset, 1);
  const monthMatrix = useMemo(() => buildMonthMatrixFromDaily(normalizedDaily, viewDate.getFullYear(), viewDate.getMonth()), [normalizedDaily, viewDate]);

  const DAILY_GOAL_MIN = prefs.daily_focus_goal_min || 120;
  const todayFocusMin = rangeSummary.today.focusMinutes;
  const todayPomodoros = rangeSummary.today.pomodoros;
  const avgPomodoroLength = rangeSummary.avgPomodoroMinutes;
  const goalProgress = DAILY_GOAL_MIN > 0 ? Math.min(1, todayFocusMin / DAILY_GOAL_MIN) : 0;

  const rangeMeta = RANGE_PRESETS.find(opt => opt.key === range);
  const rangeLabel = rangeMeta?.label || `${rangeWindow.daySpan} days`;
  const sessions = stats.sessions || [];
  const focusRatio = buildFocusRatio(sessions);
  const recentSessions = sessions;
  const sessionCount = sessions.length;
  const rangeTotals = {
    focusMinutes: rangeSummary.totalFocusMinutes,
    pomodoros: rangeSummary.pomodoros,
    daySpan: rangeSummary.daySpan,
  };
  const lifetimeTotals = {
    focusMinutes: lifetime.totalFocusMin,
    sessions: lifetime.totalSessions,
    days: lifetime.focusDays,
    avgPerDay: lifetime.avgPerDay,
  };

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
    <div className={`dash-page ${isDark?'theme-night':'theme-day'} transition-colors`}>
      <Header nav={nav} toggleTheme={toggleTheme} isDark={isDark} />
      <main className="flex-1 px-5 sm:px-10 pb-20 max-w-7xl w-full mx-auto">
        <section className="mt-4 flex flex-wrap gap-4 items-center justify-between dashboard-topbar">
          <div className="flex items-center gap-4 flex-wrap">
            <h1 className="dash-title flex items-center gap-3">
              <span>Dashboard</span>
              <span aria-label="Beta version" title="Beta version" className="beta-badge">Beta+</span>
            </h1>
            <span className="range-pill" title={rangeLabel}>{rangeLabel}</span>
          </div>
          <div className="flex items-center gap-3 flex-wrap justify-end">
            <RangeSelector value={range} onChange={setRange} presets={RANGE_PRESETS} />
            <button className="share-btn hidden sm:inline-flex" title="Share your progress (coming soon)">Share</button>
            <button onClick={()=>setShowAdvanced(s=>!s)} className="ghost-toggle">{showAdvanced? 'Collapse':'Show all'}</button>
          </div>
        </section>

        {error && (
          <div className="error-banner" role="alert">
            <span>Impossible de charger toutes les données.</span>
            <button onClick={load}>Recharger</button>
          </div>
        )}

        {/* GRID PRINCIPALE NOUVELLE STRUCTURE */}
        <div className="mt-10 grid gap-7 xl:grid-cols-12 auto-rows-min dashboard-grid">
          <TodayFocusPanel loading={loading} todayFocusMin={todayFocusMin} todayPomodoros={todayPomodoros} goal={DAILY_GOAL_MIN} goalProgress={goalProgress} avgPomodoroLength={avgPomodoroLength} onGoalChange={async (val)=>{ setSavingGoal(true); await upsertUserPreferences(user,{ daily_focus_goal_min: val}); await loadPrefs(); setSavingGoal(false); }} savingGoal={savingGoal} />
          <StreaksPanel loading={loading || lifetime.loading} current={streak} longest={longestStreak} consistency={consistency} rangeLabel={rangeLabel} goalAchieved={goalProgress>=1} />
          <InsightsPanel loading={loading} focusRatio={focusRatio} avgPomodoroLength={avgPomodoroLength} compareRange={compareRange} levelInfo={levelInfo} rangeTotals={rangeTotals} lifetimeTotals={lifetimeTotals} sessionCount={sessionCount} />
          {showAdvanced && <MonthCalendar matrix={monthMatrix} loading={loading} onPrev={()=>setMonthOffset(o=>o-1)} onNext={()=>setMonthOffset(o=>o+1)} offset={monthOffset} />}
          <section className="panel relative rounded-2xl p-5 xl:col-span-8 order-5 enhanced-panel" aria-labelledby="timelineHeading">
            <div className="mini-grid-bg" />
            <h2 id="timelineHeading" className="sr-only">Timeline focus</h2>
            <ChartsSection loading={loading} series={timelineSeries} granularity={timelineGranularity} compare={compareRange} rangeLabel={rangeLabel} rangeSummary={rangeSummary} />
          </section>
          {showAdvanced && <section className="panel relative rounded-2xl p-5 xl:col-span-4 order-6 enhanced-panel" aria-labelledby="lifetimeHeading">
            <div className="mini-grid-bg" />
            <h2 id="lifetimeHeading" className="sr-only">Progression & bilan global</h2>
            <LevelProgress info={levelInfo} />
            <div className="separator-line" />
            <LifetimePanel lifetime={lifetime} />
          </section>}
          {showAdvanced && <section className="xl:col-span-12 order-7"><RecentSessions loading={loading} sessions={recentSessions} /></section>}
        </div>
      </main>
      <footer className="text-center py-6 text-xs opacity-50">Crafted for deep focus · {user?.email}</footer>
    </div>
  );
}

function RangeSelector({ value, onChange, presets }) {
  return (
    <div className="range-selector" role="radiogroup" aria-label="Plage statistiques">
      {presets.map(opt => {
        const active = value === opt.key;
        return (
          <button
            key={opt.key}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={()=>onChange(opt.key)}
            className={`range-chip ${active? 'is-active':''}`}
            title={opt.description}
          >
            <span className="short">{opt.short}</span>
            <span className="range-chip-label">{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function Header({ nav, toggleTheme, isDark }) {
  return (
    <header className="px-5 sm:px-10 py-5 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <span className="wordmark"><span className="mark" aria-hidden="true" />Flow</span>
        <button onClick={()=>nav('/')} className="nav-link">← Timer</button>
      </div>
      <div className="flex items-center gap-4">
        <ThemeToggle isDark={isDark} toggle={toggleTheme} />
      </div>
    </header>
  );
}

// --- Panels ---
function TodayFocusPanel({ loading, todayFocusMin, todayPomodoros, goal, goalProgress, avgPomodoroLength, onGoalChange, savingGoal }) {
  const pct = Math.round(goalProgress*100);
  return (
    <section className="panel relative rounded-2xl p-5 flex flex-col gap-5 lg:col-span-4 order-1">
      <div className="mini-grid-bg" />
  <h2 className="text-sm uppercase tracking-wide opacity-60">Today</h2>
      <div className="flex items-center gap-6">
        <div className="focus-ring-wrapper">
          <div className="focus-ring" style={{ background: `conic-gradient(var(--accent) ${pct}%, var(--ring-bg) ${pct}% 100%)` }}>
            <div className="inner">{loading? '…' : todayFocusMin}<span className="unit">m</span></div>
            <div className="goal-label">{pct}%</div>
          </div>
        </div>
        <div className="flex-1 grid grid-cols-2 gap-4 text-xs">
          <div className="stat-mini"><span className="lbl">Sessions</span><span className="val">{loading? '…': todayPomodoros}</span></div>
          <div className="stat-mini"><span className="lbl">Goal</span><span className="val">{goal}m</span></div>
          <div className="stat-mini"><span className="lbl">Moy. Pomodoro</span><span className="val">{loading? '…': avgPomodoroLength ? `${avgPomodoroLength}m` : '—'}</span></div>
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

function StreaksPanel({ loading, current, longest, consistency, rangeLabel, goalAchieved }) {
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
          <span className="sm-note">{rangeLabel}</span>
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
function InsightsPanel({ loading, focusRatio, avgPomodoroLength, compareRange, levelInfo, rangeTotals, lifetimeTotals, sessionCount }) {
  const hasWeekly = !!(compareRange && compareRange.current?.length);
  const deltaLabelRaw = hasWeekly ? (compareRange.deltaMinutes>=0 ? `+${compareRange.deltaMinutes}` : `${compareRange.deltaMinutes}`) : '—';
  const deltaPctRaw = hasWeekly ? (compareRange.percent>=0 ? `+${compareRange.percent}` : `${compareRange.percent}`) : '—';
  const rangeFocus = !loading ? `${rangeTotals.focusMinutes || 0}m` : '…';
  const rangeSpanLabel = !loading ? (rangeTotals.daySpan ? `${rangeTotals.daySpan} jours` : '—') : '…';
  const lifetimeFocus = !loading ? `${lifetimeTotals.focusMinutes || 0}m` : '…';
  const lifetimeSessions = !loading ? (lifetimeTotals.sessions ?? '—') : '…';
  const ratioLabel = Number.isFinite(focusRatio) ? (sessionCount ? `${focusRatio}%` : '—') : '—';
  const avgLengthLabel = avgPomodoroLength ? `${avgPomodoroLength}m` : '—';
  return (
    <section className="panel relative rounded-2xl p-5 xl:col-span-4 order-3 insights-panel" aria-label="Insights">
      <div className="mini-grid-bg" />
      <h2 className="text-sm uppercase tracking-wide opacity-60 mb-4">Insights</h2>
      <div className="simple-chip-grid">
        <div className="simple-chip">
          <span className="lbl">Focus Ratio</span>
          <span className="val">{loading? '…': ratioLabel}<span className="sub">deep</span></span>
        </div>
        <div className="simple-chip">
          <span className="lbl">Avg Length</span>
          <span className="val">{loading? '…': avgLengthLabel}<span className="sub">pomodoro</span></span>
        </div>
        <div className="simple-chip">
          <span className="lbl">Range Focus</span>
          <span className="val">{rangeFocus}<span className="sub">{rangeSpanLabel}</span></span>
        </div>
        <div className="simple-chip">
          <span className="lbl">Lifetime Focus</span>
          <span className="val">{lifetimeFocus}<span className="sub">{lifetimeSessions} sessions · {lifetimeTotals.avgPerDay || 0}m/j</span></span>
        </div>
      </div>
      <div className="mt-4">
        <div className={`simple-chip weekly ${hasWeekly ? (compareRange.deltaMinutes>=0? 'pos':'neg') : ''}`}>
          <span className="lbl">Weekly Δ</span>
          <span className="val">{loading? '…': hasWeekly ? `${deltaLabelRaw}m` : '—'}<span className={`sub ${hasWeekly ? (compareRange.percent>=0? 'pos':'neg') : ''}`}>{loading? '…': hasWeekly ? `${deltaPctRaw}%` : '—'}</span></span>
        </div>
      </div>
      {levelInfo && (
        <div className="mt-6">
          <div className="flex justify-between text-[10px] font-medium opacity-70 mb-2"><span>Level {levelInfo.level}</span><span>{Math.round(levelInfo.progress*100)}%</span></div>
          <div className="h-2 rounded-full overflow-hidden level-mini-track">
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
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center text-[11px]">
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
        <div className="life-box">
          <span className="val">{lifetime.loading? '…': lifetime.avgPerDay}</span>
          <span className="lbl">avg m / day</span>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3 text-center text-[11px]">
        <div className="life-box">
          <span className="val text-base">🔥 {lifetime.loading? '…': lifetime.longestStreak} j</span>
          <span className="lbl">best streak</span>
        </div>
        <div className="life-box">
          <span className="val text-base">⚡ {lifetime.loading? '…': lifetime.currentStreak} j</span>
          <span className="lbl">current streak</span>
        </div>
      </div>
    </div>
  );
}

function ChartsSection({ loading, series, granularity, compare, rangeLabel, rangeSummary }) {
  const hasFocus = series.some(pt=>pt.value>0);
  const totalPomodoros = rangeSummary.pomodoros || 0;
  const granularityLabel = granularity==='day' ? 'Daily view' : granularity==='week' ? 'Weekly buckets' : 'Monthly buckets';
  const totalMinutes = rangeSummary.totalFocusMinutes;
  const focusPerDay = rangeSummary.daySpan ? Math.round(totalMinutes / rangeSummary.daySpan) : 0;
  const firstLabel = rangeSummary.firstDay ? formatFullDate(rangeSummary.firstDay) : null;
  const lastLabel = rangeSummary.lastDay ? formatFullDate(rangeSummary.lastDay) : null;

  if (!loading && (!hasFocus || totalPomodoros === 0)) {
    return (
      <div>
        <div className="flex flex-wrap items-baseline justify-between gap-3 mb-4">
          <h2 className="text-sm uppercase tracking-wide opacity-60">Timeline • {rangeLabel}</h2>
          <span className="text-[10px] opacity-50 uppercase tracking-wide">{granularityLabel}</span>
        </div>
        <EmptyTimelineState firstLabel={firstLabel} />
      </div>
    );
  }

  const max = Math.max(1, ...series.map(pt=>pt.value));
  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
        <div className="flex flex-col gap-1">
          <h2 className="text-sm uppercase tracking-wide opacity-60">Timeline • {rangeLabel}</h2>
          {firstLabel && lastLabel && (
            <span className="timeline-range-label">{firstLabel} → {lastLabel}</span>
          )}
        </div>
        <span className="text-[10px] opacity-50 uppercase tracking-wide">{granularityLabel}</span>
      </div>
      <div className="timeline-summary grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5 text-[11px]">
        <div className="summary-chip"><span className="lbl">Total Focus</span><span className="val">{totalMinutes}m</span></div>
        <div className="summary-chip"><span className="lbl">Pomodoros</span><span className="val">{totalPomodoros}</span></div>
        <div className="summary-chip"><span className="lbl">Avg / day</span><span className="val">{focusPerDay}m</span></div>
        <div className="summary-chip"><span className="lbl">Span</span><span className="val">{rangeSummary.daySpan}j</span></div>
      </div>
      <div className="flex gap-2 items-end h-44 timeline-bars">
        {series.map((pt, idx) => {
          const h = Math.max(2, Math.round((pt.value / max) * 100));
          const showLabel = shouldShowTimelineLabel(idx, series.length);
          return (
            <div key={`${pt.label}-${idx}`} className="flex-1 flex flex-col items-center min-w-[14px]">
              <div className="w-full max-w-[24px] h-full timeline-bar-track">
                <div className="timeline-bar-fill" style={{ height: loading? '0%' : h+'%' }} />
              </div>
              <span className="mt-2 text-[9px] opacity-60 uppercase tracking-wide h-4 flex items-center justify-center">
                {showLabel ? pt.label : '\u00A0'}
              </span>
            </div>
          );
        })}
      </div>
      {compare && compare.current?.length ? (
        <div className="mt-6 flex flex-wrap items-center gap-4 text-[11px] comparison-bar">
          <span className="opacity-60 uppercase tracking-wide">Weekly Comparison</span>
          <span className={`delta ${compare.deltaMinutes>=0? 'pos':'neg'}`}>{compare.deltaMinutes>=0? '+':''}{compare.deltaMinutes} min</span>
          <span className={`delta ${compare.percent>=0? 'pos':'neg'}`}>{compare.percent>=0? '+':''}{compare.percent}%</span>
          <span className="opacity-40">vs previous 7 days</span>
        </div>
      ) : null}
    </div>
  );
}

function EmptyTimelineState({ firstLabel }) {
  return (
    <div className="timeline-empty">
      <div className="empty-inner">
        <h3>Not enough data yet</h3>
        <p>Start your first pomodoro to unlock insights and see your focus timeline grow.</p>
        <Link className="empty-cta" to="/">Launch timer</Link>
        {firstLabel && <span className="first-session-hint">First recorded day: {firstLabel}</span>}
      </div>
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
        <div className="h-3 rounded-full overflow-hidden level-bar-track">
          <div className="h-full level-bar-fill" style={{ width: `${Math.min(100, info.progress*100)}%`}} />
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
                <div key={j} title={`${cell.day} • ${Math.round(cell.seconds/60)} min`} className="h-7 rounded-md relative overflow-hidden calendar-cell" style={{ background: 'var(--surface-2)', border: '1px solid var(--line)' }}>
                  <div className="absolute inset-0" style={{ background: 'var(--accent)', opacity: ratio ? 0.18 + 0.62 * ratio : 0 }} />
                  <span className="absolute inset-0 flex items-center justify-center text-[10px] font-medium" style={{ color: 'var(--ink)', opacity: 0.75 }}>{cell.day}</span>
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
      <div className="table-wrap">
        <div className="table-head grid grid-cols-5 text-[10px] uppercase tracking-wide px-4 py-2" style={{ color: 'var(--ink-faint)' }}>
          <span>Mode</span><span>Start</span><span>End</span><span>Dur (m)</span><span>Intention</span>
        </div>
        <div className="max-h-72 overflow-auto">
          {loading && <SkeletonRows />}
          {!loading && sessions.slice(0,25).map(s => (
            <div key={s.id} className="table-row grid grid-cols-5 text-xs px-4 py-2">
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

const DAY_MS = 86400000;

function normalizeDaily(raw = []) {
  const map = new Map();
  raw.forEach(entry => {
    if (!entry || !entry.day) return;
    const key = entry.day;
    const existing = map.get(key) || { day: key, focus_seconds: 0, pomodoro_count: 0 };
    map.set(key, {
      day: key,
      focus_seconds: (existing.focus_seconds || 0) + (entry.focus_seconds || 0),
      pomodoro_count: (existing.pomodoro_count || 0) + (entry.pomodoro_count || 0),
    });
  });
  return Array.from(map.values()).sort((a,b)=>a.day.localeCompare(b.day));
}

function computeRangeWindow(rangeKey, daily) {
  if (!daily.length) return { expanded: [], daySpan: 0, since: null, until: null };
  const last = daily[daily.length - 1].day;
  const lastDate = parseDay(last);
  let sinceDate;
  if (rangeKey === 'lifetime') {
    sinceDate = parseDay(daily[0].day);
  } else {
    const numeric = Number(rangeKey);
    const span = Number.isFinite(numeric) ? Math.max(1, Math.floor(numeric)) : 30;
    sinceDate = new Date(lastDate.getTime() - (span - 1) * DAY_MS);
  }
  const sinceKey = toDateKey(sinceDate);
  const untilKey = toDateKey(lastDate);
  const expanded = fillMissingDaily(daily, sinceKey, untilKey);
  return {
    expanded,
    daySpan: expanded.length,
    since: sinceKey,
    until: untilKey,
  };
}

function summarizeRange(expanded) {
  const totalFocusSeconds = expanded.reduce((a,d)=>a+(d.focus_seconds||0),0);
  const pomodoros = expanded.reduce((a,d)=>a+(d.pomodoro_count||0),0);
  const daySpan = expanded.length;
  const todayKey = toDateKey(new Date());
  const todayEntry = expanded.find(d=>d.day===todayKey) || { focus_seconds:0, pomodoro_count:0 };
  const firstDay = expanded[0]?.day || null;
  const lastDay = expanded[expanded.length-1]?.day || null;
  return {
    totalFocusSeconds,
    totalFocusMinutes: Math.round(totalFocusSeconds/60),
    pomodoros,
    avgPomodoroMinutes: pomodoros ? Math.round(totalFocusSeconds / pomodoros / 60) : 0,
    daySpan,
    firstDay,
    lastDay,
    today: {
      focusMinutes: Math.round((todayEntry.focus_seconds||0)/60),
      pomodoros: todayEntry.pomodoro_count || 0,
    },
  };
}

function summarizeLifetime(daily, loading) {
  const totalFocusSeconds = daily.reduce((a,d)=>a+(d.focus_seconds||0),0);
  const totalSessions = daily.reduce((a,d)=>a+(d.pomodoro_count||0),0);
  const focusDays = daily.length;
  const avgPerDay = focusDays ? Math.round((totalFocusSeconds/60) / focusDays) : 0;
  return {
    loading: loading && !daily.length,
    totalFocusMin: Math.round(totalFocusSeconds/60),
    totalSessions,
    focusDays,
    avgPerDay,
    longestStreak: computeLongestStreak(daily),
    currentStreak: computeStreak(daily),
  };
}

function buildWeeklyComparison(daily) {
  if (!daily.length) return { current: [], previous: [], deltaMinutes: 0, percent: 0 };
  const lastDate = parseDay(daily[daily.length - 1].day);
  const startDate = new Date(lastDate.getTime() - 13 * DAY_MS);
  const window = fillMissingDaily(daily, toDateKey(startDate), toDateKey(lastDate));
  if (window.length < 7) return { current: [], previous: [], deltaMinutes: 0, percent: 0 };
  const currentWeek = window.slice(-7);
  const previousWeek = window.slice(-14, -7);
  const sum = (arr)=>arr.reduce((a,d)=>a+(d.focus_seconds||0),0);
  const cur = sum(currentWeek);
  const prev = sum(previousWeek);
  const delta = cur - prev;
  const pct = prev ? Math.round((delta / prev) * 100) : 0;
  return {
    current: currentWeek.map(d=>d.day),
    previous: previousWeek.map(d=>d.day),
    deltaMinutes: Math.round(delta/60),
    percent: pct,
  };
}

function buildTimelineSeries(expanded) {
  if (!expanded.length) return { series: [], granularity: 'day' };
  const totalDays = expanded.length;
  if (totalDays <= MAX_TIMELINE_POINTS) {
    return {
      series: expanded.map(d=>({ label: formatDayLabel(d.day), value: toMinutes(d.focus_seconds) })),
      granularity: 'day',
    };
  }
  if (totalDays <= MAX_TIMELINE_POINTS * 4) {
    const weeks = chunkArray(expanded, 7);
    return {
      series: weeks.map(week => ({
        label: formatRangeLabel(week[0]?.day, week[week.length-1]?.day),
        value: toMinutes(sumFocus(week)),
      })),
      granularity: 'week',
    };
  }
  const months = groupByMonth(expanded);
  return {
    series: months.map(({ key, items }) => ({
      label: formatMonthLabel(key),
      value: toMinutes(sumFocus(items)),
    })),
    granularity: 'month',
  };
}

function fillMissingDaily(daily, startKey, endKey) {
  const map = new Map(daily.map(d=>[d.day, d]));
  const res = [];
  let cursor = parseDay(startKey);
  const end = parseDay(endKey);
  while (cursor <= end) {
    const key = toDateKey(cursor);
    const found = map.get(key);
    res.push({
      day: key,
      focus_seconds: found?.focus_seconds || 0,
      pomodoro_count: found?.pomodoro_count || 0,
    });
    cursor = new Date(cursor.getTime() + DAY_MS);
  }
  return res;
}

function chunkArray(arr, size) {
  const chunks = [];
  for (let i=0;i<arr.length;i+=size) {
    const slice = arr.slice(i, i+size);
    if (slice.length) chunks.push(slice);
  }
  return chunks;
}

function groupByMonth(entries) {
  const groups = new Map();
  entries.forEach(entry => {
    const [year, month] = entry.day.split('-');
    const key = `${year}-${month}`;
    const arr = groups.get(key) || [];
    arr.push(entry);
    groups.set(key, arr);
  });
  return Array.from(groups.entries()).sort(([a],[b])=>a.localeCompare(b)).map(([key, items])=>({ key, items }));
}

function sumFocus(entries) {
  return entries.reduce((a,d)=>a+(d.focus_seconds||0),0);
}

function toMinutes(seconds) {
  return Math.round((seconds || 0) / 60);
}

function parseDay(key) {
  return new Date(`${key}T00:00:00Z`);
}

function toDateKey(date) {
  const d = new Date(date);
  d.setUTCHours(0,0,0,0);
  return d.toISOString().slice(0,10);
}

function formatDayLabel(day) {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString(undefined, { month: 'numeric', day: 'numeric' });
}

function formatRangeLabel(startDay, endDay) {
  if (!startDay || !endDay) return 'Week';
  const start = new Date(`${startDay}T00:00:00Z`);
  const end = new Date(`${endDay}T00:00:00Z`);
  const fmt = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });
  return `${fmt.format(start)}-${fmt.format(end)}`;
}

function formatMonthLabel(key) {
  if (!key) return 'Month';
  const [year, month] = key.split('-').map(Number);
  return new Date(year, (month||1)-1, 1).toLocaleDateString(undefined, { month: 'short', year: '2-digit' });
}

function shouldShowTimelineLabel(index, total) {
  if (total <= 12) return true;
  if (index === 0 || index === total - 1) return true;
  const step = Math.ceil(total / 8);
  return index % step === 0;
}

function formatFullDate(day) {
  if (!day) return '';
  return new Date(`${day}T00:00:00Z`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

function buildFocusRatio(all){ if(!all.length) return 0; const focus=all.filter(s=>s.mode==='pomodoro').reduce((a,s)=>a+s.duration_seconds,0); const total=all.reduce((a,s)=>a+s.duration_seconds,0); return Math.round((focus/total)*100)||0; }
function formatClock(ts){ if(!ts) return ''; const d=new Date(ts); return d.toLocaleTimeString([], { hour: '2-digit', minute:'2-digit'}); }
