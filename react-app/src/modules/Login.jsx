import React, { useState, useEffect } from 'react';
import { useAuth } from './useAuth.js';
import { ThemeToggle } from './ThemeToggle.jsx';
import { t } from './i18n.js';

export function LoginPage({ isDark, toggleTheme, redirectHome }) {
  const { signIn, signUp, loading, error, user } = useAuth();
  const [mode, setMode] = useState('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [localError, setLocalError] = useState(null);

  useEffect(() => { document.title = t('login') + ' · Flow'; }, []);
  useEffect(()=> { if (user) redirectHome(); }, [user, redirectHome]);
  if (user) return null;

  async function submit(e) {
    e.preventDefault(); setLocalError(null);
    if (mode==='signup') {
      if (password.length < 8) { setLocalError(t('passwordTooShort')); return; }
      if (password !== confirm) { setLocalError(t('passwordMismatch')); return; }
      await signUp(email, password);
    } else {
      await signIn(email, password);
    }
  }

  return (
    <div className={`auth-page ${isDark?'theme-night':'theme-day'}`}>
      <header className="flex items-center justify-between px-5 sm:px-7 py-5">
        <button onClick={redirectHome} className="nav-link">← {t('back')}</button>
        <ThemeToggle isDark={isDark} toggle={toggleTheme} />
      </header>
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="auth-card">
          <div className="wordmark justify-center mb-2"><span className="mark" aria-hidden="true" /></div>
          <h1 className="auth-title text-center">Flow</h1>
          <p className="text-sm text-center mb-7" style={{ color: 'var(--ink-soft)' }}>{t('authIntro')}</p>
          <form onSubmit={submit} className="space-y-4 text-left">
            <div>
              <label className="input-label" htmlFor="login-email">{t('email')}</label>
              <input id="login-email" type="email" autoComplete="email" required value={email} onChange={e=>setEmail(e.target.value)} className="text-input" />
            </div>
            <div>
              <label className="input-label" htmlFor="login-password">{t('password')}</label>
              <div className="input-wrap">
                <input id="login-password" type={showPassword ? 'text' : 'password'} autoComplete={mode==='signin' ? 'current-password' : 'new-password'} required value={password} onChange={e=>setPassword(e.target.value)} className="text-input" />
                <button
                  type="button"
                  className="btn-reveal"
                  onClick={()=>setShowPassword(v=>!v)}
                  aria-label={showPassword ? t('hidePassword') : t('showPassword')}
                  title={showPassword ? t('hidePassword') : t('showPassword')}
                >
                  {showPassword ? <EyeIcon off /> : <EyeIcon />}
                </button>
              </div>
            </div>
            {mode==='signup' && (
              <div>
                <label className="input-label" htmlFor="login-confirm">{t('confirmPassword')}</label>
                <div className="input-wrap">
                  <input id="login-confirm" type={showConfirm ? 'text' : 'password'} autoComplete="new-password" required value={confirm} onChange={e=>setConfirm(e.target.value)} className="text-input" />
                  <button
                    type="button"
                    className="btn-reveal"
                    onClick={()=>setShowConfirm(v=>!v)}
                    aria-label={showConfirm ? t('hidePassword') : t('showPassword')}
                    title={showConfirm ? t('hidePassword') : t('showPassword')}
                  >
                    {showConfirm ? <EyeIcon off /> : <EyeIcon />}
                  </button>
                </div>
              </div>
            )}
            {(localError || error) && <div className="text-xs" style={{ color: 'var(--bad)' }} role="alert">{localError || error}</div>}
            <button disabled={loading} className="btn-block">{loading ? t('submitting') : (mode==='signin'? t('signIn'): t('signUp'))}</button>
            <div className="text-xs text-center pt-1">
              {mode==='signin' ? (
                <button type="button" onClick={()=>setMode('signup')} className="link-muted">{t('switchToSignUp')}</button>
              ) : (
                <button type="button" onClick={()=>setMode('signin')} className="link-muted">{t('switchToSignIn')}</button>
              )}
            </div>
          </form>
        </div>
      </div>
      <footer className="text-center py-4 text-xs" style={{ color: 'var(--ink-soft)' }}>{t('footer')}</footer>
    </div>
  );
}

function EyeIcon({ off = false }) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {off ? (
        <>
          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
          <line x1="1" y1="1" x2="23" y2="23" />
        </>
      ) : (
        <>
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
          <circle cx="12" cy="12" r="3" />
        </>
      )}
    </svg>
  );
}
