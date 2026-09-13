import React, { useState, useEffect, useCallback } from 'react';
import { TimerDisplay } from './TimerDisplay.jsx';
import { ModeSelector } from './ModeSelector.jsx';
import { Intention } from './Intention.jsx';
import { ThemeToggle } from './ThemeToggle.jsx';
import SoundControl from './SoundControl.jsx';
import { useTheme } from './useTheme.js';
import { usePomodoro } from './usePomodoro.js';
import { logSession, fetchRecentStats } from './sessionStore.js';
import { t } from './i18n.js';
import { useAuth } from './useAuth.js';
import { Link } from 'react-router-dom';

const MODE_LABELS = { pomodoro: 'focus', shortBreak: 'break', longBreak: 'long break' };

export default function App() {
  const { isDark, toggleTheme } = useTheme();
  const [pendingRating, setPendingRating] = useState(null);
  const [intention, setIntention] = useState('');
  const { user, signOut } = useAuth();
  const [stats, setStats] = useState({ sessions: [], daily: [] });
  const [showSettings, setShowSettings] = useState(false);

  const { state, start, pause, reset, switchMode, updateDurations } = usePomodoro({
    onSessionComplete: async ({ mode, startedAt, endedAt }) => {
      if (mode === 'pomodoro' && user) {
        setPendingRating({ mode, startedAt, endedAt, intention });
      } else {
        await logSession({ user, mode, startedAt, endedAt, intention });
        if (user) refreshStats();
      }
    }
  });

  async function refreshStats() {
    if (!user) return;
    const data = await fetchRecentStats(user, { days: 7 });
    setStats(data);
  }
  useEffect(() => { if (user) refreshStats(); }, [user]);

  const onLongPress = useCallback(() => setShowSettings(true), []);

  const atFullDuration = state.timeRemaining >= state.durations[state.currentMode] * 60;
  const primaryLabel = state.isRunning ? t('pause') : (atFullDuration ? t('start') : t('resume'));

  return (
    <main className={`timer-screen${state.isRunning ? ' is-running' : ''}`}>
      <header className="timer-topbar fixed top-0 left-0 right-0 z-30 flex items-center justify-between px-5 sm:px-7 py-5">
        <div className="wordmark"><span className="mark" aria-hidden="true" />Flow</div>
        <div className="flex items-center gap-3 sm:gap-4">
          <button
            aria-label="Timer settings"
            title="Settings"
            onClick={() => setShowSettings(v => !v)}
            className="icon-btn"
          >
            <svg viewBox="0 0 24 24" className="gear-svg" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="3.4" />
              <path d="M19.4 12.9c.04-.3.06-.6.06-.9s-.02-.6-.06-.9l2.07-1.62a.5.5 0 0 0 .12-.64l-1.96-3.4a.5.5 0 0 0-.6-.22l-2.44.98a7.2 7.2 0 0 0-1.56-.9l-.37-2.6A.5.5 0 0 0 14.2 2h-4.4a.5.5 0 0 0-.5.43l-.37 2.6c-.57.23-1.1.53-1.56.9l-2.44-.98a.5.5 0 0 0-.6.22L2.97 8.04a.5.5 0 0 0 .12.64L5.16 10.3c-.04.3-.06.6-.06.9s.02.6.06.9l-2.07 1.62a.5.5 0 0 0-.12.64l1.96 3.4c.14.24.43.34.6.22l2.44-.98c.46.37.99.67 1.56.9l.37 2.6c.04.25.25.43.5.43h4.4c.25 0 .46-.18.5-.43l.37-2.6c.57-.23 1.1-.53 1.56-.9l2.44.98c.24.1.5.02.6-.22l1.96-3.4a.5.5 0 0 0-.12-.64L19.4 12.9Z" />
            </svg>
          </button>
          <ThemeToggle isDark={isDark} toggle={toggleTheme} />
          {user ? (
            <>
              <Link to="/dashboard" className="nav-link hidden sm:inline">{t('dashboard')}</Link>
              <button onClick={signOut} className="nav-link">{t('logout')}</button>
            </>
          ) : (
            <Link to="/login" className="nav-pill">{t('login')}</Link>
          )}
        </div>
      </header>

      {showSettings && (
        <div className="settings-stack">
          <SoundControl />
          <InlineSettings durations={state.durations} onChange={updateDurations} />
        </div>
      )}

      <ModeSelector currentMode={state.currentMode} switchMode={switchMode} />

      <TimerDisplay
        timeRemaining={state.timeRemaining}
        progress={state.progress}
        modeLabel={MODE_LABELS[state.currentMode]}
        onLongPress={onLongPress}
      />

      {state.currentMode === 'pomodoro' && !state.isRunning && (
        <Intention value={intention} onChange={setIntention} />
      )}

      <div className="cycle-row" aria-label={`${state.pomodoroCount} of 4 focus sessions completed`}>
        {[0, 1, 2, 3].map(i => (
          <span key={i} className={`cycle-dot${i < state.pomodoroCount ? ' on' : ''}`} />
        ))}
      </div>

      <div className="controls-row">
        <button onClick={() => { state.isRunning ? pause() : start(); }} className="btn-primary">
          {primaryLabel}
        </button>
        <button onClick={reset} className="btn-ghost" title={t('reset')} aria-label={t('reset')}>↺</button>
      </div>

      <footer className="timer-footer">{t('footer')}</footer>

      {pendingRating && user && (
        <RatingModal data={pendingRating} onClose={async (rating, interrupted) => {
          if (rating || interrupted !== undefined) {
            await logSession({ user, ...pendingRating, rating: rating || null });
            if (user) refreshStats();
          }
          setPendingRating(null);
        }} />
      )}
    </main>
  );
}

function RatingModal({ data, onClose }) {
  const [value, setValue] = useState(3);
  return (
    <div className="modal-backdrop" onClick={() => onClose()}>
      <div className="modal-card" onClick={e => e.stopPropagation()}>
        <button onClick={() => onClose()} className="modal-close absolute top-3 right-4 text-sm" aria-label={t('close')}>✕</button>
        <h3 className="modal-title mb-1">{t('ratingPromptTitle')}</h3>
        <p className="text-sm mb-5" style={{ color: 'var(--ink-soft)' }}>{data.intention || t('footer')}</p>
        <div className="flex justify-between mb-6">
          {[1, 2, 3, 4, 5].map(n => (
            <button key={n} onClick={() => setValue(n)} className={`rating-btn${value === n ? ' is-active' : ''}`}>{n}</button>
          ))}
        </div>
        <div className="flex gap-3">
          <button onClick={() => onClose(value, false)} className="btn-soft">{t('save')}</button>
          <button onClick={() => onClose(null, true)} className="btn-soft secondary">{t('ratingSkip')}</button>
        </div>
      </div>
    </div>
  );
}

function InlineSettings({ durations, onChange }) {
  const [form, setForm] = useState(durations);
  const [dirty, setDirty] = useState(false);
  useEffect(() => { setForm(durations); setDirty(false); }, [durations]);

  const rows = [
    ['pomodoro', t('durationPomodoro')],
    ['shortBreak', t('durationShortBreak')],
    ['longBreak', t('durationLongBreak')]
  ];
  const update = (k, v) => setForm(s => { const val = Math.max(1, Number(v) || s[k]); setDirty(true); return { ...s, [k]: val }; });
  const presets = [
    { label: '25 / 5 / 15', p: 25, s: 5, l: 15 },
    { label: '45 / 8 / 20', p: 45, s: 8, l: 20 },
    { label: '52 / 17 / 25', p: 52, s: 17, l: 25 }
  ];
  const applyPreset = (p) => { setForm({ pomodoro: p.p, shortBreak: p.s, longBreak: p.l }); setDirty(true); };
  const isPresetActive = (p) => form.pomodoro === p.p && form.shortBreak === p.s && form.longBreak === p.l;

  return (
    <div className="card">
      <div className="card-head">
        <h4 className="card-title">{t('durationsTitle')}</h4>
        {dirty && <span className="tag">Unsaved</span>}
      </div>
      <div className="field-grid">
        {rows.map(([k, label]) => (
          <div key={k} className="field">
            <span className="field-label">{label}</span>
            <div className="field-stepper">
              <button onClick={() => update(k, form[k] - 1)} className="step-btn" aria-label={`${label} minus`}>−</button>
              <input className="num-field" type="number" value={form[k]} onChange={e => update(k, e.target.value)} aria-label={label} />
              <button onClick={() => update(k, form[k] + 1)} className="step-btn" aria-label={`${label} plus`}>+</button>
            </div>
          </div>
        ))}
      </div>
      <div className="chip-row mb-4">
        {presets.map(p => (
          <button key={p.label} onClick={() => applyPreset(p)} className={`chip${isPresetActive(p) ? ' is-active' : ''}`}>{p.label}</button>
        ))}
      </div>
      <div className="btn-row">
        <button disabled={!dirty} onClick={() => { onChange(form); setDirty(false); }} className="btn-soft">{t('save')}</button>
        <button disabled={!dirty} onClick={() => { setForm(durations); setDirty(false); }} className="btn-soft secondary">{t('reset')}</button>
      </div>
    </div>
  );
}
