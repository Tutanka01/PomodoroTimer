import { useState, useEffect } from 'react';
const KEY = 'flow-theme';
export function useTheme() {
  const [theme, setTheme] = useState(()=> localStorage.getItem(KEY) || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
  useEffect(()=> {
    localStorage.setItem(KEY, theme);
    const meta = document.getElementById('theme-color-meta');
    if (meta) meta.content = theme==='dark' ? '#000000' : '#f1f5f9';
    document.documentElement.style.colorScheme = theme==='dark' ? 'dark' : 'light';
    document.body.classList.remove('theme-day','theme-night');
    document.body.classList.add(theme==='dark' ? 'theme-night' : 'theme-day');
  }, [theme]);
  useEffect(()=> {
    const handler = (e)=> {
      if(!e.ctrlKey && !e.metaKey && !e.altKey && e.key.toLowerCase()==='d') {
        e.preventDefault();
        setTheme(t=> t==='dark' ? 'light' : 'dark');
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);
  return { theme, isDark: theme==='dark', toggleTheme: ()=> setTheme(t=> t==='dark' ? 'light' : 'dark') };
}
