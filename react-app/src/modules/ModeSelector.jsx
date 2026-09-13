import React from 'react';

const MODES = [
  { key: 'pomodoro', label: 'Focus' },
  { key: 'shortBreak', label: 'Break' },
  { key: 'longBreak', label: 'Long' }
];

export function ModeSelector({ currentMode, switchMode }) {
  return (
    <div className="mode-seg" role="tablist" aria-label="Timer mode">
      {MODES.map(m => (
        <button
          key={m.key}
          role="tab"
          aria-selected={currentMode === m.key}
          onClick={() => switchMode(m.key)}
          className={`mode-pill${currentMode === m.key ? ' is-active' : ''}`}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}
