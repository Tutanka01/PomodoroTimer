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
  , login: 'Login'
  , logout: 'Logout'
  , email: 'Email'
  , password: 'Password'
  , confirmPassword: 'Confirm Password'
  , signIn: 'Sign In'
  , signUp: 'Create Account'
  , needAccount: 'Need an account?'
  , haveAccount: 'Have an account?'
  , passwordMismatch: 'Passwords do not match'
  , passwordTooShort: 'Minimum 8 characters'
  , checkEmail: 'Check your email to confirm your account.'
  , createAccountCta: 'Sign up'
  , signInCta: 'Sign in'
  , cancel: 'Cancel'
  , submitting: 'Working...'
  , or: 'or'
  , switchToSignUp: 'Need an account? Sign up'
  , switchToSignIn: 'Have an account? Sign in'
  , authIntro: 'Optional account to sync your stats.'
  , dashboard: 'Dashboard'
  , focusMinutes: 'Focus (min)'
  , today: 'Today'
  , streak: 'Streak'
  , avgPerPomo: 'Avg / Pomo'
  , focusRatio: 'Focus Ratio'
  , hourlyDistribution: 'Hourly Distribution'
  , calendar: 'Calendar'
  , badges: 'Badges'
  , level: 'Level'
  , nextLevel: 'Next Level'
  , consistency: 'Consistency'
  , longestStreak: 'Longest Streak'
  , ratingPromptTitle: 'How focused were you?'
  , ratingSkip: 'Skip'
  , ratingInterrupted: 'Interrupted'
  , save: 'Save'
  , monthTotal: 'Month Total'
  , noData: 'No data'
  }
};

export function t(key, lang = 'en') {
  return STRINGS[lang]?.[key] ?? key;
}
