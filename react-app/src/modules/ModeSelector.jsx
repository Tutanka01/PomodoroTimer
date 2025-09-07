import React from 'react';
import { t } from './i18n.js';

export function ModeSelector({ currentMode, switchMode }) {
  const modes = [
  { key: 'pomodoro', label: t('pomodoro') },
  { key: 'shortBreak', label: t('shortBreak') },
  { key: 'longBreak', label: t('longBreak') },
  ];
  return (
    <div id="mode-selector" className="flex justify-center space-x-2 sm:space-x-4 mb-8">
      {modes.map(m => (
        <button key={m.key} data-mode={m.key} onClick={()=>switchMode(m.key)} className={`mode-btn px-4 py-2 rounded-full font-semibold transition-all duration-300 ease-in-out focus:outline-none focus:ring-2 focus:ring-white/50 ${currentMode===m.key ? 'bg-black/10 dark:bg-white/20' : ''}`}>{m.label}</button>
      ))}
    </div>
  );
}
