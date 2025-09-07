import React from 'react';

export function ThemeToggle({ isDark, toggle }) {
  return (
  <button id="theme-toggle" onClick={toggle} className={`theme-toggle ${isDark ? 'is-dark' : ''}`} aria-label="Toggle theme" aria-pressed={isDark} title="Theme (D key)">
      <svg className="icon icon-sun" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2m16 0h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>
      <svg className="icon icon-moon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
      <span className="knob" aria-hidden="true"></span>
    </button>
  );
}
