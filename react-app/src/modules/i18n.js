export const STRINGS = {
  en: {
    pomodoro: 'Pomodoro',
    shortBreak: 'Short Break',
    longBreak: 'Long Break',
    start: 'Start',
    resume: 'Resume',
    pause: 'Pause',
    reset: 'Reset',
    intentionPlaceholder: "What's your intention?",
    durationsTitle: 'Durations (minutes)',
    durationPomodoro: 'Pomodoro',
    durationShortBreak: 'Short Break',
    durationLongBreak: 'Long Break',
    close: 'Close',
    footer: 'Created with a focus philosophy.',
    ultraFocus: 'Ultra Focus',
    themeToggle: 'Toggle theme',
    modeSelectorAria: 'Select mode'
  }
};

export function t(key, lang = 'en') {
  return STRINGS[lang]?.[key] ?? key;
}
