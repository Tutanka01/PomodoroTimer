import React from 'react';
import { t } from './i18n.js';

const MODES = [
  { key: 'pomodoro', labelKey: 'modePomodoro' },
  { key: 'shortBreak', labelKey: 'modeShortBreak' },
  { key: 'longBreak', labelKey: 'modeLongBreak' }
];

// Groupe de radios natif : navigation clavier flèches fournie par le navigateur.
export function ModeSelector({ currentMode, switchMode }) {
  return (
    <div className="mode-seg" role="radiogroup" aria-label={t('modeSelectorAria')}>
      {MODES.map(m => {
        const checked = currentMode === m.key;
        return (
          <label key={m.key} className={`mode-pill${checked ? ' is-active' : ''}`}>
            <input
              type="radio"
              name="timer-mode"
              value={m.key}
              checked={checked}
              onChange={() => switchMode(m.key)}
              className="mode-radio"
            />
            {t(m.labelKey)}
          </label>
        );
      })}
    </div>
  );
}
