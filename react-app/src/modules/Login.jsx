import React, { useState, useEffect } from 'react';
import { useAuth } from './useAuth.js';
import { ThemeToggle } from './ThemeToggle.jsx';
import { t } from './i18n.js';

export function LoginPage({ isDark, toggleTheme, redirectHome }) {
  const { signIn, signUp, signInWithGoogle, loading, error, user } = useAuth();
  const [mode, setMode] = useState('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [localError, setLocalError] = useState(null);
  const [emailSent, setEmailSent] = useState(false);
  useEffect(()=> { if (user) redirectHome(); }, [user, redirectHome]);
  if (user) return null;
  async function submit(e) {
    e.preventDefault(); setLocalError(null);
    if (mode==='signup') {
      if (password.length < 8) { setLocalError(t('passwordTooShort')); return; }
      if (password !== confirm) { setLocalError(t('passwordMismatch')); return; }
      const { error } = await signUp(email, password);
      if (!error) setEmailSent(true);
    } else {
      await signIn(email, password);
    }
  }
  return (
    <div className={`auth-page ${isDark?'theme-night':'theme-day'}`}>
      <header className="flex items-center justify-between px-5 sm:px-7 py-5">
        <button onClick={redirectHome} className="nav-link">← Back</button>
        <ThemeToggle isDark={isDark} toggle={toggleTheme} />
      </header>
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="auth-card">
          <div className="wordmark justify-center mb-2"><span className="mark" aria-hidden="true" /></div>
          <h1 className="auth-title text-center">Flow</h1>
          <p className="text-sm text-center mb-7" style={{ color: 'var(--ink-soft)' }}>{t('authIntro')}</p>
          {emailSent ? (
            <div className="text-center space-y-6">
              <p className="text-sm">{t('checkEmail')}</p>
              <button onClick={redirectHome} className="btn-block">{t('close')}</button>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4 text-left">
              <div>
                <label className="input-label">{t('email')}</label>
                <input type="email" required value={email} onChange={e=>setEmail(e.target.value)} className="text-input" />
              </div>
              <div>
                <label className="input-label">{t('password')}</label>
                <input type="password" required value={password} onChange={e=>setPassword(e.target.value)} className="text-input" />
              </div>
              {mode==='signup' && (
                <div>
                  <label className="input-label">{t('confirmPassword')}</label>
                  <input type="password" required value={confirm} onChange={e=>setConfirm(e.target.value)} className="text-input" />
                </div>
              )}
              {(localError || error) && <div className="text-xs" style={{ color: 'var(--bad)' }}>{localError || error}</div>}
              <button disabled={loading} className="btn-block">{loading ? t('submitting') : (mode==='signin'? t('signIn'): t('signUp'))}</button>
              <div className="divider py-1">{t('or')}</div>
              <button type="button" onClick={()=>signInWithGoogle()} className="btn-google" aria-label="Continue with Google">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" className="w-5 h-5">
                  <path fill="#EA4335" d="M24 9.5c3.54 0 6 1.54 7.38 2.83l5.4-5.26C33.64 3.34 29.28 1.5 24 1.5 14.82 1.5 6.73 6.98 3.04 15.02l6.9 5.36C11.53 13.67 17.2 9.5 24 9.5z"/>
                  <path fill="#4285F4" d="M46.5 24.5c0-1.62-.15-2.8-.47-4.02H24v7.53h12.65c-.26 1.9-1.66 4.76-4.77 6.68l7.36 5.72c4.41-4.07 7.26-10.06 7.26-15.91z"/>
                  <path fill="#FBBC05" d="M9.94 20.38l-6.9-5.36A23.93 23.93 0 0 0 1.5 24c0 3.82.92 7.42 2.54 10.62l6.96-5.43C10.25 27.66 9.5 25.93 9.5 24c0-1.9.74-3.62 1.94-5.62z"/>
                  <path fill="#34A853" d="M24 46.5c6.48 0 11.91-2.13 15.88-5.8l-7.36-5.72c-2 1.26-4.7 2.14-8.52 2.14-6.8 0-12.47-4.17-14.5-9.75l-6.96 5.43C6.73 41.02 14.82 46.5 24 46.5z"/>
                  <path fill="none" d="M1.5 1.5h45v45h-45z"/>
                </svg>
                <span>Continue with Google</span>
              </button>
              <div className="text-xs text-center pt-1">
                {mode==='signin' ? (
                  <button type="button" onClick={()=>setMode('signup')} className="link-muted">{t('switchToSignUp')}</button>
                ) : (
                  <button type="button" onClick={()=>setMode('signin')} className="link-muted">{t('switchToSignIn')}</button>
                )}
              </div>
            </form>
          )}
        </div>
      </div>
      <footer className="text-center py-4 text-xs" style={{ color: 'var(--ink-faint)' }}>{t('footer')}</footer>
    </div>
  );
}
