import { ensureAudioStarted, playNotificationSound, playStartSound } from './audio.js';
import { updateThemeToggleUI } from './theme.js';

export const SESSIONS_BEFORE_LONG_BREAK = 4;

const elements = {};
const timers = { pomodoro: 25, shortBreak: 5, longBreak: 15 };
const state = { currentMode: 'pomodoro', timeRemaining: 0, timerId: null, isRunning: false, pomodoroCount: 0 };

function cacheElements() {
  Object.assign(elements, {
    body: document.body,
    mainContent: document.getElementById('main-content'),
    timerDisplay: document.getElementById('timer-display'),
    startPauseBtn: document.getElementById('start-pause-btn'),
    resetBtn: document.getElementById('reset-btn'),
    modeButtons: document.querySelectorAll('.mode-btn'),
    intentionInput: document.getElementById('intention-input'),
    intentionDisplay: document.getElementById('intention-display'),
    cycleDots: document.querySelectorAll('#pomodoro-counter .cycle-dot'),
    ultraFocusBtn: document.getElementById('ultra-focus-btn'),
    settingsModal: document.getElementById('settings-modal'),
    saveSettingsBtn: document.getElementById('save-settings-btn'),
    themeToggle: document.getElementById('theme-toggle')
  });
}

function updateDisplay() {
  const minutes = Math.floor(state.timeRemaining / 60).toString().padStart(2, '0');
  const seconds = (state.timeRemaining % 60).toString().padStart(2, '0');
  elements.timerDisplay.textContent = `${minutes}:${seconds}`;
  document.title = `${minutes}:${seconds} - Flow`;
}

function updateCounterUI() {
  elements.cycleDots.forEach((dot, i) => {
    dot.style.backgroundColor = i < state.pomodoroCount ? 'var(--counter-fill)' : 'var(--counter-empty)';
  });
}

function manageIntention(showInput) {
  elements.intentionInput.classList.toggle('hidden', !showInput);
  elements.intentionDisplay.classList.toggle('hidden', showInput);
  if (!showInput) {
    elements.intentionDisplay.textContent = elements.intentionInput.value || 'Rester concentré';
  }
}

function updateThemeAndColors() {
  const isNight = elements.body.classList.contains('theme-night');
  document.documentElement.style.setProperty('--counter-fill', isNight ? '#e2e8f0' : '#0f172a');
  document.documentElement.style.setProperty('--counter-empty', isNight ? 'rgba(226, 232, 240, 0.2)' : 'rgba(15, 23, 42, 0.2)');
  elements.modeButtons.forEach(b => b.style.backgroundColor = b.dataset.mode === state.currentMode ? (isNight ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.1)') : '');
  elements.intentionInput.style.borderColor = isNight ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.2)';
  elements.intentionInput.style.color = isNight ? '#e2e8f0' : '#0f172a';
  elements.intentionDisplay.style.color = isNight ? 'rgba(226, 232, 240, 0.7)' : 'rgba(15, 23, 42, 0.7)';
  elements.resetBtn.style.backgroundColor = isNight ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)';
}

function updateUIForState() {
  elements.timerDisplay.classList.remove('timer-idle', 'timer-work', 'timer-break');
  elements.body.classList.remove('state-idle', 'state-work', 'state-break');
  const isNight = elements.body.classList.contains('theme-night');

  if (state.isRunning) {
    if (state.currentMode === 'pomodoro') {
      elements.body.classList.add('state-work');
      elements.timerDisplay.classList.add('timer-work');
      elements.startPauseBtn.style.backgroundColor = isNight ? '#831843' : '#f43f5e';
    } else {
      elements.body.classList.add('state-break');
      elements.timerDisplay.classList.add('timer-break');
      elements.startPauseBtn.style.backgroundColor = isNight ? '#0f766e' : '#10b981';
    }
    elements.timerDisplay.classList.add('scale-105');
    elements.startPauseBtn.textContent = 'Pause';
    manageIntention(false);
  } else {
    elements.body.classList.add('state-idle');
    elements.timerDisplay.classList.add('timer-idle');
    elements.timerDisplay.classList.remove('scale-105');
    elements.startPauseBtn.style.backgroundColor = isNight ? '#fafafa' : '#0f172a';
    elements.startPauseBtn.textContent = state.isRunning || state.timeRemaining < timers[state.currentMode] * 60 ? 'Reprendre' : 'Démarrer';
    if (state.currentMode === 'pomodoro') manageIntention(true);
  }
  elements.startPauseBtn.style.color = (state.isRunning || !isNight) ? '#fafafa' : '#0f172a';
  updateThemeAndColors();
  updateThemeToggleUI();
}

function tick() {
  state.timeRemaining--;
  updateDisplay();
  if (state.timeRemaining < 0) {
    playNotificationSound();
    if (state.currentMode === 'pomodoro') {
      state.pomodoroCount++;
      switchMode(state.pomodoroCount >= SESSIONS_BEFORE_LONG_BREAK ? 'longBreak' : 'shortBreak');
      if (state.pomodoroCount >= SESSIONS_BEFORE_LONG_BREAK) state.pomodoroCount = 0;
      updateCounterUI();
    } else {
      switchMode('pomodoro');
    }
  }
}

function startTimer() {
  if (state.isRunning) return;
  ensureAudioStarted().then(() => {
    playStartSound();
  });
  state.isRunning = true;
  state.timerId = setInterval(tick, 1000);
  updateUIForState();
}

function pauseTimer() {
  state.isRunning = false;
  clearInterval(state.timerId);
  state.timerId = null;
  updateUIForState();
}

function resetTimer() {
  pauseTimer();
  state.timeRemaining = timers[state.currentMode] * 60;
  updateDisplay();
  updateUIForState();
}

function switchMode(mode) {
  state.currentMode = mode;
  if (mode !== 'pomodoro') {
    elements.intentionInput.classList.add('hidden');
    elements.intentionDisplay.classList.add('hidden');
  }
  resetTimer();
}

function closeSettings() {
  timers.pomodoro = parseInt(document.getElementById('pomodoro-duration').value) || 25;
  timers.shortBreak = parseInt(document.getElementById('shortbreak-duration').value) || 5;
  timers.longBreak = parseInt(document.getElementById('longbreak-duration').value) || 15;
  localStorage.setItem('flow-timers', JSON.stringify(timers));
  elements.settingsModal.classList.add('hidden');
  if (!state.isRunning) resetTimer();
}

function attachEvents() {
  elements.startPauseBtn.addEventListener('click', () => state.isRunning ? pauseTimer() : startTimer());
  elements.resetBtn.addEventListener('click', resetTimer);
  elements.modeButtons.forEach(button => button.addEventListener('click', () => switchMode(button.dataset.mode)));
  elements.ultraFocusBtn.addEventListener('click', () => elements.body.classList.toggle('ultra-focus-active'));
  elements.mainContent.addEventListener('dblclick', () => elements.body.classList.contains('ultra-focus-active') && elements.body.classList.remove('ultra-focus-active'));
  elements.saveSettingsBtn.addEventListener('click', closeSettings);

  let longPressTimer;
  elements.timerDisplay.addEventListener('mousedown', () => longPressTimer = setTimeout(() => elements.settingsModal.classList.remove('hidden'), 1000));
  elements.timerDisplay.addEventListener('mouseup', () => clearTimeout(longPressTimer));
  elements.timerDisplay.addEventListener('mouseleave', () => clearTimeout(longPressTimer));
}

function styleBaseElements() {
  document.querySelectorAll('.mode-btn, .control-btn, .setting-input').forEach(el => {
    if (el.tagName === 'INPUT') el.classList.add('bg-transparent', 'border', 'rounded-lg', 'w-20', 'text-center', 'py-1', 'focus:outline-none', 'focus:ring-2', 'focus:ring-white/50');
    else el.classList.add('px-4', 'py-2', 'rounded-full', 'font-semibold', 'transition-all', 'duration-300', 'ease-in-out', 'focus:outline-none', 'focus:ring-2', 'focus:ring-white/50');
  });
  document.querySelectorAll('.cycle-dot').forEach(dot => dot.classList.add('w-3', 'h-3', 'rounded-full', 'transition-colors', 'duration-500'));
}

export function initializeTimer() {
  cacheElements();
  const savedTimers = JSON.parse(localStorage.getItem('flow-timers'));
  if (savedTimers) Object.assign(timers, savedTimers);
  document.getElementById('pomodoro-duration').value = timers.pomodoro;
  document.getElementById('shortbreak-duration').value = timers.shortBreak;
  document.getElementById('longbreak-duration').value = timers.longBreak;

  state.timeRemaining = timers.pomodoro * 60;
  styleBaseElements();
  updateDisplay();
  updateCounterUI();
  updateUIForState();
  attachEvents();
}
