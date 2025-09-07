import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from './useAuth.js';
import { useTheme } from './useTheme.js';
import { fetchRecentStats } from './sessionStore.js';
import { ThemeToggle } from './ThemeToggle.jsx';

export function DashboardPage() {
  const nav = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const [range, setRange] = useState(7);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ sessions: [], daily: [] });
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!user) return; setLoading(true); setError(null);
    const data = await fetchRecentStats(user, { days: range });
    setStats(data); setLoading(false);
  }, [user, range]);

  // Rediriger seulement quand on sait que l'utilisateur n'est pas connecté (pas pendant le chargement)
  useEffect(()=> { if (!authLoading && !user) nav('/login'); }, [authLoading, user, nav]);
  useEffect(()=> { if (!authLoading && user) load(); }, [authLoading, user, load]);

  const safe = stats || { sessions: [], daily: [] };
  const totalFocusSec = safe.sessions.filter(s=>s.mode==='pomodoro').reduce((a,s)=>a+(s.duration_seconds||0),0);
  const totalFocusMin = Math.round(totalFocusSec/60);
  const today = new Date().toISOString().slice(0,10);
  const todayPomodoros = safe.sessions.filter(s=>s.mode==='pomodoro' && (s.started_at||'').startsWith(today)).length;
  const streak = computeStreak(safe.daily||[]);
  const avgPomodoroLength = averageLength(safe.sessions.filter(s=>s.mode==='pomodoro'));
  const focusRatio = buildFocusRatio(safe.sessions);

  // Pendant phase de détermination de la session on affiche un écran neutre (évite flicker)
  if (authLoading) {
    return (
      <div className={`min-h-screen flex flex-col items-center justify-center ${isDark?'theme-night':'theme-day'}`}> 
        <div className="animate-pulse text-sm opacity-60">Loading...</div>
      </div>
    );
  }

  if (!user) return null; // redirection imminente

  return (
    <div className={`min-h-screen flex flex-col ${isDark?'theme-night':'theme-day'} transition-colors`}> 
      <Header nav={nav} toggleTheme={toggleTheme} isDark={isDark} />
      <main className="flex-1 px-5 sm:px-10 pb-16 max-w-6xl w-full mx-auto">
        <section className="mt-6 flex flex-wrap gap-4 items-center justify-between">
          <h1 className="text-3xl font-semibold tracking-tight">Dashboard</h1>
          <div className="flex gap-2 bg-white/10 dark:bg-white/5 rounded-full p-1">
            {[7,14,30].map(d => (
              <button key={d} onClick={()=>setRange(d)} className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${range===d? 'bg-gradient-to-r from-pink-500 to-indigo-500 text-white shadow':'opacity-70 hover:opacity-100'}`}>{d}d</button>
            ))}
          </div>
        </section>
        <section className="mt-8 grid gap-6 md:grid-cols-5 sm:grid-cols-3 grid-cols-2">
          <MetricCard label="Focus (min)" value={loading? '…' : totalFocusMin} accent />
          <MetricCard label="Today" value={loading? '…': todayPomodoros} />
            <MetricCard label="Streak" value={loading? '…': streak} />
          <MetricCard label="Avg / Pomo" value={loading? '…': avgPomodoroLength+'m'} />
          <MetricCard label="Focus Ratio" value={loading? '…': focusRatio+'%'} />
        </section>
        <ChartsSection loading={loading} daily={safe.daily} range={range} />
        <RecentSessions loading={loading} sessions={safe.sessions} />
      </main>
      <footer className="text-center py-6 text-xs opacity-50">Crafted for deep focus · {user?.email}</footer>
    </div>
  );
}

function Header({ nav, toggleTheme, isDark }) {
  return (
    <header className="px-5 sm:px-10 py-5 flex items-center justify-between backdrop-blur-md">
      <div className="flex items-center gap-4">
        <button onClick={()=>nav('/')} className="text-xs opacity-70 hover:opacity-100">← Back</button>
      </div>
      <div className="flex items-center gap-4">
        <ThemeToggle isDark={isDark} toggle={toggleTheme} />
      </div>
    </header>
  );
}

function MetricCard({ label, value, accent }) {
  return (
    <div className={`rounded-2xl p-4 relative overflow-hidden group ${accent? 'bg-gradient-to-br from-pink-500/70 to-indigo-600/60 text-white':'bg-white/10 dark:bg-white/5'}`}>
      <div className="text-[11px] uppercase tracking-wide opacity-70 group-hover:opacity-90 transition-opacity">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
      <div className="absolute inset-0 pointer-events-none opacity-0 group-hover:opacity-30 transition-opacity bg-[radial-gradient(circle_at_30%_30%,rgba(255,255,255,0.6),transparent_60%)]" />
    </div>
  );
}

function ChartsSection({ loading, daily, range }) {
  const days = buildLast(range);
  const max = Math.max(1, ...daily.map(d=>d.focus_seconds));
  return (
    <section className="mt-12">
      <h2 className="text-sm uppercase tracking-wide opacity-60 mb-4">Focus Timeline</h2>
      <div className="flex gap-2 items-end h-40">
        {days.map(d => {
          const rec = daily.find(r=>r.day===d);
          const value = rec? rec.focus_seconds : 0;
          const h = Math.round((value / max) * 100);
          return (
            <div key={d} className="flex-1 flex flex-col items-center">
              <div className="w-full max-w-[26px] h-full rounded-xl bg-white/5 dark:bg-white/10 relative overflow-hidden">
                <div className="absolute bottom-0 left-0 w-full bg-gradient-to-t from-pink-500 to-indigo-500 transition-all duration-700" style={{ height: loading? '0%' : h+'%' }} />
              </div>
              <span className="mt-2 text-[10px] opacity-60">{d.slice(5)}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function RecentSessions({ loading, sessions }) {
  return (
    <section className="mt-14 mb-10">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-sm uppercase tracking-wide opacity-60">Recent Sessions</h2>
        <span className="text-[10px] opacity-50">Latest {Math.min(25, sessions.length)}</span>
      </div>
      <div className="border border-white/10 rounded-2xl overflow-hidden">
        <div className="grid grid-cols-5 text-[10px] uppercase tracking-wide opacity-60 px-4 py-2 bg-white/5 dark:bg-white/10">
          <span>Mode</span><span>Start</span><span>End</span><span>Dur (m)</span><span>Intention</span>
        </div>
        <div className="max-h-72 overflow-auto thin-scroll">
          {loading && <SkeletonRows />}
          {!loading && sessions.slice(0,25).map(s => (
            <div key={s.id} className="grid grid-cols-5 text-xs px-4 py-2 odd:bg-white/2 even:bg-transparent hover:bg-white/10 transition-colors">
              <span className="font-medium capitalize">{s.mode}</span>
              <span className="opacity-70 tabular-nums">{formatClock(s.started_at)}</span>
              <span className="opacity-70 tabular-nums">{formatClock(s.ended_at)}</span>
              <span className="opacity-70">{Math.round(s.duration_seconds/60)}</span>
              <span className="truncate opacity-70" title={s.intention || ''}>{s.intention || '—'}</span>
            </div>
          ))}
          {!loading && sessions.length===0 && (
            <div className="px-4 py-6 text-xs opacity-60 text-center">No sessions yet.</div>
          )}
        </div>
      </div>
    </section>
  );
}

function SkeletonRows() {
  return Array.from({ length: 8 }).map((_,i)=>(
    <div key={i} className="grid grid-cols-5 px-4 py-2 animate-pulse">
      {Array.from({length:5}).map((_,j)=>(<span key={j} className="h-3 rounded bg-white/10" />))}
    </div>
  ));
}

function buildLast(n) {
  const arr = []; for(let i=n-1;i>=0;i--){ arr.push(new Date(Date.now()-i*24*3600*1000).toISOString().slice(0,10)); } return arr;
}
function computeStreak(daily) {
  const map = new Set(daily.filter(r=>r.focus_seconds>0).map(r=>r.day));
  let streak=0; for(let i=0;;i++){ const d=new Date(Date.now()-i*24*3600*1000).toISOString().slice(0,10); if(map.has(d)) streak++; else break; } return streak;
}
function averageLength(pomos) { if(!pomos.length) return 0; return Math.round(pomos.reduce((a,s)=>a+s.duration_seconds,0)/(pomos.length*60)); }
function buildFocusRatio(all){ if(!all.length) return 0; const focus=all.filter(s=>s.mode==='pomodoro').reduce((a,s)=>a+s.duration_seconds,0); const total=all.reduce((a,s)=>a+s.duration_seconds,0); return Math.round((focus/total)*100)||0; }
function formatClock(ts){ if(!ts) return ''; const d=new Date(ts); return d.toLocaleTimeString([], { hour: '2-digit', minute:'2-digit'}); }
