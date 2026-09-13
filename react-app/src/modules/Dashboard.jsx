import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from './useAuth.js';
import { fetchRecentStats } from './sessionStore.js';
import { computeConsistency, computeLongestStreak, computeLevel, buildMonthMatrixFromDaily, computeStreak } from './statsUtils.js';
import { ThemeToggle } from './ThemeToggle.jsx';
import { getUserPreferences, upsertUserPreferences } from './userPrefs.js';
import { t, LOCALE } from './i18n.js';

const RANGE_PRESETS = [
  { key: '7', labelKey: 'range7', short: '7j' },
  { key: '30', labelKey: 'range30', short: '30j' },
  { key: '90', labelKey: 'range90', short: '90j' },
  { key: '365', labelKey: 'range365', short: '12m' },
  { key: 'lifetime', labelKey: 'rangeLifetime', short: '∞' }
];

const DEFAULT_RANGE = '7';
const MAX_TIMELINE_POINTS = 120;

// Jours de la semaine (lundi → dimanche) en français.
const WEEKDAYS = Array.from({ length: 7 }, (_, i) => {
  const label = new Intl.DateTimeFormat(LOCALE, { weekday: 'short' }).format(new Date(2024, 0, 1 + i));
  const clean = label.replace('.', '');
  return clean.charAt(0).toUpperCase() + clean.slice(1);
});

export function DashboardPage({ isDark = false, toggleTheme = () => {} }) {
  const nav = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [range, setRange] = useState(DEFAULT_RANGE);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ sessions: [], daily: [], allDaily: [] });
  const [error, setError] = useState(null);
  const [prefs, setPrefs] = useState({ daily_focus_goal_min: 120 });
  const [savingGoal, setSavingGoal] = useState(false);

  useEffect(() => {
    document.title = t('dashboard') + ' · Flow';
  }, []);

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
  const rangeLabel = rangeMeta ? t(rangeMeta.labelKey) : `${rangeWindow.daySpan} ${t('days')}`;
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
        <div className="animate-pulse text-sm opacity-60">{t('loading')}</div>
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
              <span>{t('dashboard')}</span>
              <span aria-label={t('betaLabel')} title={t('betaLabel')} className="beta-badge">Beta+</span>
            </h1>
            <span className="range-pill" title={t('rangeAria')}>{rangeLabel}</span>
          </div>
          <div className="flex items-center gap-3 flex-wrap justify-end">
            <RangeSelector value={range} onChange={setRange} presets={RANGE_PRESETS} />
            <button
              onClick={()=>setShowAdvanced(s=>!s)}
              className="ghost-toggle"
              aria-expanded={showAdvanced}
            >
              {showAdvanced ? t('collapse') : t('showAll')}
            </button>
          </div>
        </section>

        {error && (
          <div className="error-banner" role="alert">
            <span>{t('loadError')}</span>
            <button onClick={load}>{t('reload')}</button>
          </div>
        )}

        {/* GRID PRINCIPALE NOUVELLE STRUCTURE */}
        <div className="mt-10 grid gap-7 xl:grid-cols-12 auto-rows-min dashboard-grid">
          <TodayFocusPanel loading={loading} todayFocusMin={todayFocusMin} todayPomodoros={todayPomodoros} goal={DAILY_GOAL_MIN} goalProgress={goalProgress} avgPomodoroLength={avgPomodoroLength} onGoalChange={async (val)=>{ setSavingGoal(true); await upsertUserPreferences(user,{ daily_focus_goal_min: val}); await loadPrefs(); setSavingGoal(false); }} savingGoal={savingGoal} />
          <StreaksPanel loading={loading || lifetime.loading} current={streak} longest={longestStreak} consistency={consistency} rangeLabel={rangeLabel} goalAchieved={goalProgress>=1} />
          <section className="panel relative rounded-2xl p-5 xl:col-span-8 order-5 enhanced-panel" aria-labelledby="timelineHeading">
            <div className="mini-grid-bg" />
            <h2 id="timelineHeading" className="sr-only">{t('timeline')} · {rangeLabel}</h2>
            <ChartsSection loading={loading} series={timelineSeries} granularity={timelineGranularity} compare={compareRange} rangeLabel={rangeLabel} rangeSummary={rangeSummary} />
          </section>
          {showAdvanced && <InsightsPanel loading={loading} focusRatio={focusRatio} avgPomodoroLength={avgPomodoroLength} compareRange={compareRange} levelInfo={levelInfo} rangeTotals={rangeTotals} lifetimeTotals={lifetimeTotals} sessionCount={sessionCount} />}
          {showAdvanced && <MonthCalendar matrix={monthMatrix} loading={loading} onPrev={()=>setMonthOffset(o=>o-1)} onNext={()=>setMonthOffset(o=>o+1)} offset={monthOffset} />}
          {showAdvanced && <section className="panel relative rounded-2xl p-5 xl:col-span-4 order-6 enhanced-panel" aria-labelledby="lifetimeHeading">
            <div className="mini-grid-bg" />
            <h2 id="lifetimeHeading" className="sr-only">{t('levelProgress')} & {t('globalSummary')}</h2>
            <LevelProgress info={levelInfo} />
            <div className="separator-line" />
            <LifetimePanel lifetime={lifetime} />
          </section>}
          {showAdvanced && <section className="xl:col-span-12 order-7"><RecentSessions loading={loading} sessions={recentSessions} /></section>}
        </div>
      </main>
      <footer className="text-center py-6 text-xs opacity-60">{t('footer')} · {user?.email}</footer>
    </div>
  );
}

function RangeSelector({ value, onChange, presets }) {
  return (
    <div className="range-selector" role="radiogroup" aria-label={t('rangeAria')}>
      {presets.map(opt => {
        const active = value === opt.key;
        const label = t(opt.labelKey);
        return (
          <button
            key={opt.key}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={label}
            onClick={()=>onChange(opt.key)}
            className={`range-chip ${active? 'is-active':''}`}
            title={label}
          >
            <span className="short">{opt.short}</span>
            <span className="range-chip-label">{label}</span>
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
        <button onClick={()=>nav('/')} className="nav-link">← {t('timer')}</button>
      </div>
      <div className="flex items-center gap-4">
        <ThemeToggle isDark={isDark} toggle={toggleTheme} />
      </div>
    </header>
  );
}

function modeLabel(mode) {
  if (mode === 'shortBreak') return t('modeShortBreak');
  if (mode === 'longBreak') return t('modeLongBreak');
  if (mode === 'pomodoro') return t('modePomodoro');
  return mode;
}

// --- Panels ---
function TodayFocusPanel({ loading, todayFocusMin, todayPomodoros, goal, goalProgress, avgPomodoroLength, onGoalChange, savingGoal }) {
  const pct = Math.round(goalProgress*100);
  return (
    <section className="panel relative rounded-2xl p-5 flex flex-col gap-5 lg:col-span-4 order-1">
      <div className="mini-grid-bg" />
      <h2 className="text-sm uppercase tracking-wide opacity-60">{t('today')}</h2>
      <div className="flex items-center gap-6">
        <div className="focus-ring-wrapper">
          <div className="focus-ring" style={{ background: `conic-gradient(var(--accent) ${pct}%, var(--ring-bg) ${pct}% 100%)` }}>
            <div className="inner">{loading? '…' : todayFocusMin}<span className="unit">{t('minutes')}</span></div>
            <div className="goal-label">{pct}%</div>
          </div>
        </div>
        <div className="flex-1 grid grid-cols-2 gap-4 text-xs">
          <div className="stat-mini"><span className="lbl">{t('pomodoros')}</span><span className="val">{loading? '…': todayPomodoros}</span></div>
          <div className="stat-mini"><span className="lbl">{t('dailyGoal')}</span><span className="val">{goal} {t('minutes')}</span></div>
          <div className="stat-mini"><span className="lbl">{t('avgPomodoro')}</span><span className="val">{loading? '…': avgPomodoroLength ? `${avgPomodoroLength} ${t('minutes')}` : '—'}</span></div>
          <div className="stat-mini"><span className="lbl">{t('remaining')}</span><span className="val">{Math.max(0, goal - todayFocusMin)} {t('minutes')}</span></div>
        </div>
      </div>
      <p className="text-xs leading-snug opacity-60">
        {goalProgress>=1 ? t('goalReached') : t('goalHint', { n: goal })}
      </p>
      <GoalEditor current={goal} onChange={onGoalChange} saving={savingGoal} />
    </section>
  );
}

function GoalEditor({ current, onChange, saving }) {
  const [val,setVal] = useState(current);
  useEffect(()=>{ setVal(current); }, [current]);
  return (
    <div className="flex items-center gap-2 text-xs flex-wrap">
      <span className="opacity-60 uppercase tracking-wide">{t('dailyGoal')}</span>
      <input type="number" min={15} step={15} value={val} onChange={e=>setVal(e.target.value)} className="goal-input" aria-label={t('dailyGoal')} />
      <button disabled={saving || val==current} onClick={()=>onChange(Number(val)||current)} className="goal-save-btn disabled:opacity-40 disabled:cursor-not-allowed">{saving? t('loading') : t('save')}</button>
    </div>
  );
}

function StreaksPanel({ loading, current, longest, consistency, rangeLabel, goalAchieved }) {
  return (
    <section className="panel relative rounded-2xl p-5 flex flex-col gap-5 lg:col-span-4 order-2">
      <div className="mini-grid-bg" />
      <h2 className="text-sm uppercase tracking-wide opacity-60">{t('streaks')}</h2>
      <div className="grid grid-cols-2 gap-4">
        <div className="streak-box">
          <span className="lbl">{t('currentStreak')}</span>
          <span className="big-val">{loading? '…': current}</span>
          <span className="sm-note">{current > 1 ? t('days') : t('day')}</span>
        </div>
        <div className="streak-box">
          <span className="lbl">{t('bestStreak')}</span>
            <span className="big-val">{loading? '…': longest}</span>
          <span className="sm-note">{longest > 1 ? t('days') : t('day')}</span>
        </div>
        <div className="streak-box">
          <span className="lbl">{t('consistency')}</span>
          <span className="big-val">{loading? '…': consistency+'%'}</span>
          <span className="sm-note">{rangeLabel}</span>
        </div>
        <div className="streak-box">
          <span className="lbl">{t('safety')}</span>
          <span className={`badge ${goalAchieved? 'ok':'pending'}`}>{goalAchieved? t('reached'): t('inProgress')}</span>
          <span className="sm-note">{t('dailyGoal')}</span>
        </div>
      </div>
      <p className="text-xs leading-snug opacity-60">{t('keepStreak')}</p>
    </section>
  );
}

function InsightsPanel({ loading, focusRatio, avgPomodoroLength, compareRange, levelInfo, rangeTotals, lifetimeTotals, sessionCount }) {
  const hasWeekly = !!(compareRange && compareRange.current?.length);
  const deltaLabelRaw = hasWeekly ? (compareRange.deltaMinutes>=0 ? `+${compareRange.deltaMinutes}` : `${compareRange.deltaMinutes}`) : '—';
  const deltaPctRaw = hasWeekly ? (compareRange.percent>=0 ? `+${compareRange.percent}` : `${compareRange.percent}`) : '—';
  const rangeFocus = !loading ? `${rangeTotals.focusMinutes || 0} ${t('minutes')}` : '…';
  const rangeSpanLabel = !loading ? (rangeTotals.daySpan ? `${rangeTotals.daySpan} ${t('days')}` : '—') : '…';
  const lifetimeFocus = !loading ? `${lifetimeTotals.focusMinutes || 0} ${t('minutes')}` : '…';
  const lifetimeSessions = !loading ? (lifetimeTotals.sessions ?? '—') : '…';
  const ratioLabel = Number.isFinite(focusRatio) ? (sessionCount ? `${focusRatio}%` : '—') : '—';
  const avgLengthLabel = avgPomodoroLength ? `${avgPomodoroLength} ${t('minutes')}` : '—';
  return (
    <section className="panel relative rounded-2xl p-5 xl:col-span-4 order-3 insights-panel" aria-label={t('insights')}>
      <div className="mini-grid-bg" />
      <h2 className="text-sm uppercase tracking-wide opacity-60 mb-4">{t('insights')}</h2>
      <div className="simple-chip-grid">
        <div className="simple-chip">
          <span className="lbl">{t('focusRatio')}</span>
          <span className="val">{loading? '…': ratioLabel}<span className="sub">{t('deepWork')}</span></span>
        </div>
        <div className="simple-chip">
          <span className="lbl">{t('avgLength')}</span>
          <span className="val">{loading? '…': avgLengthLabel}<span className="sub">{t('perPomodoro')}</span></span>
        </div>
        <div className="simple-chip">
          <span className="lbl">{t('rangeFocus')}</span>
          <span className="val">{rangeFocus}<span className="sub">{rangeSpanLabel}</span></span>
        </div>
        <div className="simple-chip">
          <span className="lbl">{t('lifetimeFocus')}</span>
          <span className="val">{lifetimeFocus}<span className="sub">{t('sessionsInline', { n: lifetimeSessions })} · {lifetimeTotals.avgPerDay || 0} {t('minutes')} / {t('day')}</span></span>
        </div>
      </div>
      <div className="mt-4">
        <div className={`simple-chip weekly ${hasWeekly ? (compareRange.deltaMinutes>=0? 'pos':'neg') : ''}`}>
          <span className="lbl">{t('weeklyDelta')}</span>
          <span className="val">{loading? '…': hasWeekly ? `${deltaLabelRaw} ${t('minutes')}` : '—'}<span className={`sub ${hasWeekly ? (compareRange.percent>=0? 'pos':'neg') : ''}`}>{loading? '…': hasWeekly ? `${deltaPctRaw}%` : '—'}</span></span>
        </div>
      </div>
      {levelInfo && (
        <div className="mt-6">
          <div className="flex justify-between text-xs font-medium opacity-60 mb-2"><span>{t('level')} {levelInfo.level}</span><span>{Math.round(levelInfo.progress*100)}%</span></div>
          <div className="h-2 rounded-full overflow-hidden level-mini-track">
            <div className="h-full level-mini-fill" style={{ width: `${Math.min(100, levelInfo.progress*100)}%`}} />
          </div>
          <div className="text-xs opacity-60 mt-2">{t('nextLevelIn', { n: levelInfo.needed - levelInfo.current })}</div>
        </div>
      )}
    </section>
  );
}

function LifetimePanel({ lifetime }) {
  return (
    <div className="lifetime-grid">
      <h3 className="text-xs uppercase tracking-wide opacity-60 mb-3">{t('globalSummary')}</h3>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center text-xs">
        <div className="life-box">
          <span className="val">{lifetime.loading? '…': lifetime.totalFocusMin}</span>
          <span className="lbl">{t('minFocus')}</span>
        </div>
        <div className="life-box">
          <span className="val">{lifetime.loading? '…': lifetime.totalSessions}</span>
          <span className="lbl">{t('sessions')}</span>
        </div>
        <div className="life-box">
          <span className="val">{lifetime.loading? '…': lifetime.focusDays}</span>
          <span className="lbl">{t('activeDays')}</span>
        </div>
        <div className="life-box">
          <span className="val">{lifetime.loading? '…': lifetime.avgPerDay}</span>
          <span className="lbl">{t('minPerDay')}</span>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3 text-center text-xs">
        <div className="life-box">
          <span className="val text-sm">🔥 {lifetime.loading? '…': lifetime.longestStreak} j</span>
          <span className="lbl">{t('bestStreak')}</span>
        </div>
        <div className="life-box">
          <span className="val text-sm">⚡ {lifetime.loading? '…': lifetime.currentStreak} j</span>
          <span className="lbl">{t('currentStreak')}</span>
        </div>
      </div>
    </div>
  );
}

function ChartsSection({ loading, series, granularity, compare, rangeLabel, rangeSummary }) {
  const hasFocus = series.some(pt=>pt.value>0);
  const totalPomodoros = rangeSummary.pomodoros || 0;
  const granularityLabel = granularity==='day' ? t('viewDaily') : granularity==='week' ? t('viewWeekly') : t('viewMonthly');
  const totalMinutes = rangeSummary.totalFocusMinutes;
  const focusPerDay = rangeSummary.daySpan ? Math.round(totalMinutes / rangeSummary.daySpan) : 0;
  const firstLabel = rangeSummary.firstDay ? formatFullDate(rangeSummary.firstDay) : null;
  const lastLabel = rangeSummary.lastDay ? formatFullDate(rangeSummary.lastDay) : null;

  if (!loading && (!hasFocus || totalPomodoros === 0)) {
    return (
      <div>
        <div className="flex flex-wrap items-baseline justify-between gap-3 mb-4">
          <h2 className="text-sm uppercase tracking-wide opacity-60">{t('timeline')} • {rangeLabel}</h2>
          <span className="text-xs opacity-60 uppercase tracking-wide">{granularityLabel}</span>
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
          <h2 className="text-sm uppercase tracking-wide opacity-60">{t('timeline')} • {rangeLabel}</h2>
          {firstLabel && lastLabel && (
            <span className="timeline-range-label">{firstLabel} → {lastLabel}</span>
          )}
        </div>
        <span className="text-xs opacity-60 uppercase tracking-wide">{granularityLabel}</span>
      </div>
      <div className="timeline-summary grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5 text-xs">
        <div className="summary-chip"><span className="lbl">{t('totalFocus')}</span><span className="val">{totalMinutes} {t('minutes')}</span></div>
        <div className="summary-chip"><span className="lbl">{t('pomodoros')}</span><span className="val">{totalPomodoros}</span></div>
        <div className="summary-chip"><span className="lbl">{t('avgPerDay')}</span><span className="val">{focusPerDay} {t('minutes')}</span></div>
        <div className="summary-chip"><span className="lbl">{t('span')}</span><span className="val">{rangeSummary.daySpan} {t('days')}</span></div>
      </div>
      <div className="flex gap-2 items-end h-44 timeline-bars" role="img" aria-label={t('chartSummary', { range: rangeLabel })}>
        {series.map((pt, idx) => {
          const h = Math.max(2, Math.round((pt.value / max) * 100));
          const showLabel = shouldShowTimelineLabel(idx, series.length);
          const barLabel = t('chartBarAria', { label: pt.label, value: pt.value });
          return (
            <div key={`${pt.label}-${idx}`} className="flex-1 flex flex-col items-center min-w-[14px]">
              <div className="w-full max-w-[24px] h-full timeline-bar-track" role="img" aria-label={barLabel} title={barLabel}>
                <div className="timeline-bar-fill" style={{ height: loading? '0%' : h+'%' }} />
              </div>
              <span className="mt-2 text-xs opacity-60 uppercase tracking-wide h-4 flex items-center justify-center">
                {showLabel ? pt.label : '\u00A0'}
              </span>
            </div>
          );
        })}
      </div>
      <ul className="sr-only">
        {series.map((pt, idx) => (
          <li key={`${pt.label}-${idx}`}>{pt.label} : {pt.value} {t('minutes')}</li>
        ))}
      </ul>
      {compare && compare.current?.length ? (
        <div className="mt-6 flex flex-wrap items-center gap-4 text-xs comparison-bar">
          <span className="opacity-60 uppercase tracking-wide">{t('weeklyDelta')}</span>
          <span className={`delta ${compare.deltaMinutes>=0? 'pos':'neg'}`}>{compare.deltaMinutes>=0? '+':''}{compare.deltaMinutes} {t('minutes')}</span>
          <span className={`delta ${compare.percent>=0? 'pos':'neg'}`}>{compare.percent>=0? '+':''}{compare.percent}%</span>
          <span className="opacity-60">{t('previousWeek')}</span>
        </div>
      ) : null}
    </div>
  );
}

function EmptyTimelineState({ firstLabel }) {
  return (
    <div className="timeline-empty">
      <div className="empty-inner">
        <h3>{t('emptyTitle')}</h3>
        <p>{t('emptyText')}</p>
        <Link className="empty-cta" to="/">{t('emptyCta')}</Link>
        {firstLabel && <span className="first-session-hint">{t('emptyFirstDay', { date: firstLabel })}</span>}
      </div>
    </div>
  );
}

function LevelProgress({ info }) {
  if (!info) return null;
  return (
    <div className="mt-10 panel">
      <div className="mini-grid-bg" />
      <h2 className="text-sm uppercase tracking-wide opacity-60 mb-3">{t('levelProgress')}</h2>
      <div>
        <div className="flex justify-between text-xs opacity-60 mb-2"><span>{t('level')} {info.level}</span><span>{Math.round(info.progress*100)}%</span></div>
        <div className="h-3 rounded-full overflow-hidden level-bar-track">
          <div className="h-full level-bar-fill" style={{ width: `${Math.min(100, info.progress*100)}%`}} />
        </div>
        <div className="text-xs opacity-60 mt-2">{t('nextLevelIn', { n: info.needed - info.current })}</div>
      </div>
    </div>
  );
}

function MonthCalendar({ matrix, onPrev, onNext }) {
  if (!matrix) return null;
  const weeks = mondayFirstWeeks(matrix.weeks);
  const max = weeks.flat().filter(Boolean).reduce((m,c)=>Math.max(m,c.seconds),0) || 1;
  const monthLabel = new Intl.DateTimeFormat(LOCALE, { month: 'long', year: 'numeric' }).format(new Date(matrix.year, matrix.month, 1));
  return (
    <section className="panel relative rounded-2xl p-5 lg:col-span-4 order-3">
      <div className="mini-grid-bg" />
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <button onClick={onPrev} className="nav-chip" aria-label={t('prevMonth')} title={t('prevMonth')}>←</button>
          <h2 className="text-sm uppercase tracking-wide opacity-60">{monthLabel}</h2>
          <button onClick={onNext} className="nav-chip" aria-label={t('nextMonth')} title={t('nextMonth')}>→</button>
        </div>
        <span className="text-xs opacity-60">{t('monthTotal')} · {Math.round(matrix.totalSeconds/60)} {t('minutes')}</span>
      </div>
      <div className="grid grid-cols-7 gap-1 mb-1">
        {WEEKDAYS.map(day => (
          <span key={day} className="cal-weekday text-xs text-center opacity-60">{day}</span>
        ))}
      </div>
      <div className="space-y-1">
        {weeks.map((w,i)=>(
          <div key={i} className="grid grid-cols-7 gap-1">
            {w.map((cell,j)=>{
              if(!cell) return <div key={j} className="h-7 rounded-md bg-transparent" />;
              const ratio = cell.seconds / max;
              const minutes = Math.round(cell.seconds/60);
              const dateKey = `${matrix.year}-${String(matrix.month+1).padStart(2,'0')}-${String(cell.day).padStart(2,'0')}`;
              const dateLabel = formatFullDate(dateKey);
              const cellLabel = t('chartBarAria', { label: dateLabel, value: minutes });
              return (
                <div key={j} title={cellLabel} aria-label={cellLabel} className="h-7 rounded-md relative overflow-hidden calendar-cell" style={{ background: 'var(--surface-2)', border: '1px solid var(--line)' }}>
                  <div className="absolute inset-0" style={{ background: 'var(--accent)', opacity: ratio ? 0.18 + 0.62 * ratio : 0 }} />
                  <span className="absolute inset-0 flex items-center justify-center text-xs font-medium" style={{ color: 'var(--ink)', opacity: 0.6 }}>{cell.day}</span>
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
  const rows = sessions.slice(0, 25);
  return (
    <section className="mt-14 mb-10">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-sm uppercase tracking-wide opacity-60">{t('recentSessions')}</h2>
        <span className="text-xs opacity-60">{t('latestCount', { n: Math.min(25, sessions.length) })}</span>
      </div>
      <div className="session-cards sm:hidden">
        {loading && <SkeletonCards />}
        {!loading && rows.length === 0 && (
          <p className="text-sm opacity-60 text-center py-4">{t('noSessions')}</p>
        )}
        {!loading && rows.map(s => (
          <article key={s.id} className="session-card">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium">{modeLabel(s.mode)}</span>
              <span className="text-sm font-semibold tabular-nums">{Math.round(s.duration_seconds/60)} {t('minutes')}</span>
            </div>
            <div className="text-xs tabular-nums opacity-60">{formatClock(s.started_at)} → {formatClock(s.ended_at)}</div>
            <div className="text-xs opacity-60">{s.intention || '—'}</div>
            {s.productivity_rating ? <div className="text-xs">★ {s.productivity_rating}/5</div> : null}
          </article>
        ))}
      </div>
      <div className="table-wrap hidden sm:block">
        <div className="table-head grid grid-cols-5 text-xs uppercase tracking-wide px-4 py-2" style={{ color: 'var(--ink-soft)' }}>
          <span>{t('colMode')}</span><span>{t('colStart')}</span><span>{t('colEnd')}</span><span>{t('colDuration')}</span><span>{t('colIntention')}</span>
        </div>
        <div className="max-h-72 overflow-auto">
          {loading && <SkeletonRows />}
          {!loading && rows.map(s => (
            <div key={s.id} className="table-row grid grid-cols-5 text-sm px-4 py-2">
              <span className="font-medium">{modeLabel(s.mode)}</span>
              <span className="opacity-60 tabular-nums">{formatClock(s.started_at)}</span>
              <span className="opacity-60 tabular-nums">{formatClock(s.ended_at)}</span>
              <span className="opacity-60 tabular-nums">{Math.round(s.duration_seconds/60)}</span>
              <span className="truncate opacity-60" title={s.intention || ''}>{s.intention || '—'}</span>
            </div>
          ))}
          {!loading && rows.length===0 && (
            <div className="px-4 py-6 text-sm opacity-60 text-center">{t('noSessions')}</div>
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

function SkeletonCards() {
  return Array.from({ length: 4 }).map((_,i)=>(
    <div key={i} className="session-card animate-pulse" aria-hidden="true">
      <span className="block h-3 rounded bg-white/10" />
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
  return new Date(`${day}T00:00:00Z`).toLocaleDateString(LOCALE, { month: 'numeric', day: 'numeric' });
}

function formatRangeLabel(startDay, endDay) {
  if (!startDay || !endDay) return '—';
  const start = new Date(`${startDay}T00:00:00Z`);
  const end = new Date(`${endDay}T00:00:00Z`);
  const fmt = new Intl.DateTimeFormat(LOCALE, { month: 'short', day: 'numeric' });
  return `${fmt.format(start)}-${fmt.format(end)}`;
}

function formatMonthLabel(key) {
  if (!key) return '—';
  const [year, month] = key.split('-').map(Number);
  return new Date(year, (month||1)-1, 1).toLocaleDateString(LOCALE, { month: 'short', year: '2-digit' });
}

function shouldShowTimelineLabel(index, total) {
  if (total <= 12) return true;
  if (index === 0 || index === total - 1) return true;
  const step = Math.ceil(total / 8);
  return index % step === 0;
}

function formatFullDate(day) {
  if (!day) return '';
  return new Date(`${day}T00:00:00Z`).toLocaleDateString(LOCALE, { day: 'numeric', month: 'short', year: 'numeric' });
}

// Reconstruit les semaines pour un affichage commençant le lundi.
function mondayFirstWeeks(weeks) {
  const days = weeks.flat().filter(Boolean);
  const sundayLead = weeks[0] ? weeks[0].findIndex(cell => cell !== null) : 0;
  const lead = (sundayLead + 6) % 7;
  const cells = [...new Array(lead).fill(null), ...days];
  while (cells.length % 7 !== 0) cells.push(null);
  const out = [];
  for (let i=0;i<cells.length;i+=7) out.push(cells.slice(i, i+7));
  return out;
}

function buildFocusRatio(all){ if(!all.length) return 0; const focus=all.filter(s=>s.mode==='pomodoro').reduce((a,s)=>a+s.duration_seconds,0); const total=all.reduce((a,s)=>a+s.duration_seconds,0); return Math.round((focus/total)*100)||0; }
function formatClock(ts){ if(!ts) return ''; const d=new Date(ts); return d.toLocaleTimeString(LOCALE, { hour: '2-digit', minute:'2-digit'}); }
