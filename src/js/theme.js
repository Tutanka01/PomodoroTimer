const THEME_STORAGE_KEY = 'flow-theme';

export function applyTheme(theme, { persist = true } = {}) {
  const body = document.body;
  body.classList.remove('theme-day', 'theme-night');
  const isDark = theme === 'dark';
  body.classList.add(isDark ? 'theme-night' : 'theme-day');
  const themeMeta = document.getElementById('theme-color-meta');
  if (themeMeta) themeMeta.setAttribute('content', isDark ? '#000000' : '#f1f5f9');
  document.documentElement.style.colorScheme = isDark ? 'dark' : 'light';
  if (persist) localStorage.setItem(THEME_STORAGE_KEY, theme);
  updateThemeToggleUI();
}

export function loadInitialTheme() {
  const savedTheme = localStorage.getItem(THEME_STORAGE_KEY);
  return savedTheme ?? (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
}

export function updateThemeToggleUI() {
  const themeToggle = document.getElementById('theme-toggle');
  if (!themeToggle) return;
  const isDark = document.body.classList.contains('theme-night');
  themeToggle.setAttribute('aria-pressed', String(isDark));
  themeToggle.classList.toggle('is-dark', isDark);
}

export function wireThemeToggle() {
  const themeToggle = document.getElementById('theme-toggle');
  if (!themeToggle) return;
  themeToggle.addEventListener('click', () => {
    const isDark = document.body.classList.contains('theme-night');
    applyTheme(isDark ? 'light' : 'dark');
  });
  document.addEventListener('keydown', (e) => {
    if (!e.ctrlKey && !e.metaKey && !e.altKey && e.key.toLowerCase() === 'd') {
      e.preventDefault();
      themeToggle.click();
    }
  });
}
