import React, { useState, useEffect, useRef } from 'react';
import { TimerDisplay } from './TimerDisplay.jsx';
import { ModeSelector } from './ModeSelector.jsx';
import { Intention } from './Intention.jsx';
import { ThemeToggle } from './ThemeToggle.jsx';
import SoundControl from './SoundControl.jsx';
import { usePomodoro } from './usePomodoro.js';
import { logSession, updateSessionRating } from './sessionStore.js';
import { t } from './i18n.js';
import { useAuth } from './useAuth.js';
import { Link } from 'react-router-dom';

const MODE_LABELS = {
  pomodoro: t('modePomodoro'),
  shortBreak: t('modeShortBreak'),
  longBreak: t('modeLongBreak')
};

export default function App({ isDark, toggleTheme }) {
  const [pendingRating, setPendingRating] = useState(null); // session enregistrée en attente de note
  const [intention, setIntention] = useState('');
  const { user, signOut } = useAuth();
  const [showSettings, setShowSettings] = useState(false);
  const settingsPanelRef = useRef(null);

  const { state, start, pause, reset, switchMode, updateDurations } = usePomodoro({
    onSessionComplete: async ({ mode, startedAt, endedAt }) => {
      // La session est TOUJOURS enregistrée ; la note n'est qu'une étape facultative ensuite.
      const session = user ? await logSession({ mode, startedAt, endedAt, intention, interrupted: false }) : null;
      if (mode === 'pomodoro') {
        setIntention('');
        if (session) setPendingRating(session);
      }
    }
  });

  // Raccourcis clavier : Espace = démarrer/pause, R = réinitialiser, Échap = fermer les réglages.
  useEffect(() => {
    const onKey = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey || pendingRating) return;
      const el = e.target;
      // Ne pas voler Espace/Entrée quand un contrôle interactif a le focus.
      if (el && el.closest && el.closest('button, a, input, textarea, select, [contenteditable]')) return;
      if (e.code === 'Space') {
        e.preventDefault();
        state.isRunning ? pause() : start();
      } else if (e.key.toLowerCase() === 'r') {
        e.preventDefault();
        reset();
      } else if (e.key === 'Escape') {
        setShowSettings(false);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [state.isRunning, start, pause, reset]);

  // Donne le focus au panneau de réglages à l'ouverture.
  useEffect(() => { if (showSettings) settingsPanelRef.current?.focus(); }, [showSettings]);

  const atFullDuration = state.timeRemaining >= state.durations[state.currentMode] * 60;
  const primaryLabel = state.isRunning ? t('pause') : (atFullDuration ? t('start') : t('resume'));

  return (
    <main className={`timer-screen${state.isRunning ? ' is-running' : ''}`}>
      <header className="timer-topbar fixed top-0 left-0 right-0 z-30 flex items-center justify-between px-5 sm:px-7 py-5">
        <div className="wordmark"><span className="mark" aria-hidden="true" />Flow</div>
        <div className="flex items-center gap-3 sm:gap-4">
          <button
            aria-label={t('timerSettings')}
            title={t('settingsTitle')}
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
        <div className="settings-layer">
          <div className="settings-backdrop" onClick={() => setShowSettings(false)} />
          <aside
            ref={settingsPanelRef}
            tabIndex={-1}
            className="settings-panel"
            role="dialog"
            aria-modal="true"
            aria-label={t('settingsTitle')}
          >
            <header className="settings-head">
              <h2 className="settings-title">{t('settingsTitle')}</h2>
              <button className="icon-btn" onClick={() => setShowSettings(false)} aria-label={t('close')}>✕</button>
            </header>
            <div className="settings-body">
              <SoundControl />
              <InlineSettings durations={state.durations} onChange={updateDurations} disabled={state.isRunning} />
            </div>
          </aside>
        </div>
      )}

      <ModeSelector currentMode={state.currentMode} switchMode={switchMode} />

      <TimerDisplay
        timeRemaining={state.timeRemaining}
        progress={state.progress}
        modeLabel={MODE_LABELS[state.currentMode]}
      />

      {state.currentMode === 'pomodoro' && !state.isRunning && (
        <Intention value={intention} onChange={setIntention} />
      )}

      <div className="cycle-row">
        {[0, 1, 2, 3].map(i => (
          <span key={i} className={`cycle-dot${i < state.pomodoroCount ? ' on' : ''}`} />
        ))}
        <span className="cycle-label">{state.pomodoroCount}/4 {t('cycleBeforeLongBreak')}</span>
      </div>

      <div className="controls-row">
        <button onClick={() => { state.isRunning ? pause() : start(); }} className="btn-primary">
          {primaryLabel}
        </button>
        <button onClick={reset} className="btn-ghost" title={t('reset')} aria-label={t('reset')}>↺</button>
      </div>

      <footer className="timer-footer">{t('footer')}</footer>

      {pendingRating && (
        <RatingModal
          session={pendingRating}
          onClose={async (rating) => {
            if (rating) await updateSessionRating(pendingRating.id, rating);
            setPendingRating(null);
          }}
        />
      )}
    </main>
  );
}

function RatingModal({ session, onClose }) {
  const [value, setValue] = useState(null);
  return (
    <div className="modal-backdrop" onClick={() => onClose(null)}>
      <div className="modal-card" role="dialog" aria-modal="true" aria-labelledby="rating-title" onClick={e => e.stopPropagation()}>
        <button onClick={() => onClose(null)} className="modal-close absolute top-3 right-4 text-sm" aria-label={t('close')}>✕</button>
        <h3 id="rating-title" className="modal-title mb-1">{t('ratingPromptTitle')}</h3>
        {session.intention && <p className="text-sm mb-5" style={{ color: 'var(--ink-soft)' }}>{session.intention}</p>}
        <div className="flex justify-between mb-3" role="radiogroup" aria-labelledby="rating-title">
          {[1, 2, 3, 4, 5].map(n => (
            <button
              key={n}
              role="radio"
              aria-checked={value === n}
              onClick={() => setValue(n)}
              className={`rating-btn${value === n ? ' is-active' : ''}`}
            >{n}</button>
          ))}
        </div>
        <div className="rating-scale" aria-hidden="true">
          <span>{t('rating1')}</span>
          <span>{t('rating3')}</span>
          <span>{t('rating5')}</span>
        </div>
        <p className="rating-hint">{t('ratingHint')}</p>
        <div className="btn-row">
          <button onClick={() => onClose(value)} disabled={!value} className="btn-soft">{t('ratingSave')}</button>
          <button onClick={() => onClose(null)} className="btn-soft secondary">{t('ratingLater')}</button>
        </div>
      </div>
    </div>
  );
}

function InlineSettings({ durations, onChange, disabled }) {
  const [form, setForm] = useState(durations);
  const [dirty, setDirty] = useState(false);
  useEffect(() => { setForm(durations); setDirty(false); }, [durations]);

  const rows = [
    ['pomodoro', t('modePomodoro')],
    ['shortBreak', t('modeShortBreak')],
    ['longBreak', t('modeLongBreak')]
  ];
  const update = (k, v) => {
    if (disabled) return;
    setForm(s => {
      const val = Math.min(180, Math.max(1, Number(v) || s[k]));
      return { ...s, [k]: val };
    });
    setDirty(true);
  };
  const presets = [
    { label: '25 / 5 / 15', p: 25, s: 5, l: 15 },
    { label: '45 / 8 / 20', p: 45, s: 8, l: 20 },
    { label: '52 / 17 / 25', p: 52, s: 17, l: 25 }
  ];
  const applyPreset = (p) => {
    if (disabled) return;
    setForm({ pomodoro: p.p, shortBreak: p.s, longBreak: p.l });
    setDirty(true);
  };
  const isPresetActive = (p) => form.pomodoro === p.p && form.shortBreak === p.s && form.longBreak === p.l;

  return (
    <div className="card">
      <div className="card-head">
        <h3 className="card-title">{t('durationsTitle')}</h3>
        {dirty && !disabled && <span className="tag">{t('unsaved')}</span>}
      </div>
      {disabled && <p className="rating-hint">{t('durationsLocked')}</p>}
      <div className="field-grid">
        {rows.map(([k, label]) => (
          <div key={k} className="field">
            <span className="field-label">{label}</span>
            <div className="field-stepper">
              <button disabled={disabled} onClick={() => update(k, form[k] - 1)} className="step-btn" aria-label={`${label} −1`}>−</button>
              <input
                className="num-field"
                type="number"
                min="1"
                max="180"
                value={form[k]}
                disabled={disabled}
                onChange={e => update(k, e.target.value)}
                aria-label={label}
              />
              <button disabled={disabled} onClick={() => update(k, form[k] + 1)} className="step-btn" aria-label={`${label} +1`}>+</button>
            </div>
          </div>
        ))}
      </div>
      <div className="chip-row mb-4">
        {presets.map(p => (
          <button key={p.label} disabled={disabled} onClick={() => applyPreset(p)} className={`chip${isPresetActive(p) ? ' is-active' : ''}`}>{p.label}</button>
        ))}
      </div>
      <div className="btn-row">
        <button disabled={disabled || !dirty} onClick={() => { onChange(form); setDirty(false); }} className="btn-soft">{t('save')}</button>
        <button disabled={disabled || !dirty} onClick={() => { setForm(durations); setDirty(false); }} className="btn-soft secondary">{t('reset')}</button>
      </div>
    </div>
  );
}
