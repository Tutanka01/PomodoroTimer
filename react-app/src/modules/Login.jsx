import React, { useState } from 'react';
import { useAuth } from './useAuth.js';
import { ThemeToggle } from './ThemeToggle.jsx';
import { t } from './i18n.js';

export function LoginPage({ isDark, toggleTheme, redirectHome }) {
  const { signIn, signUp, loading, error, user } = useAuth();
  const [mode, setMode] = useState('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [localError, setLocalError] = useState(null);
  const [emailSent, setEmailSent] = useState(false);
  if (user) { redirectHome(); return null; }
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
    <div className={`min-h-screen flex flex-col ${isDark?'theme-night':'theme-day'} transition-colors`}>
      <header className="flex items-center justify-between px-6 py-4">
        <button onClick={redirectHome} className="text-sm opacity-70 hover:opacity-100">← Back</button>
        <ThemeToggle isDark={isDark} toggle={toggleTheme} />
      </header>
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="glass-container w-full max-w-md rounded-3xl p-8 relative overflow-hidden">
          <h1 className="text-2xl font-bold mb-2 text-center">Flow Focus</h1>
          <p className="text-xs text-center mb-6 opacity-70">{t('authIntro')}</p>
          {emailSent ? (
            <div className="text-center space-y-6">
              <p className="text-sm">{t('checkEmail')}</p>
              <button onClick={redirectHome} className="control-btn w-full">{t('close')}</button>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-5 text-left">
              <div>
                <label className="text-sm opacity-70">{t('email')}</label>
                <input type="email" required value={email} onChange={e=>setEmail(e.target.value)} className="mt-1 w-full bg-white/10 dark:bg-white/5 border border-white/20 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-pink-400" />
              </div>
              <div>
                <label className="text-sm opacity-70">{t('password')}</label>
                <input type="password" required value={password} onChange={e=>setPassword(e.target.value)} className="mt-1 w-full bg-white/10 dark:bg-white/5 border border-white/20 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-pink-400" />
              </div>
              {mode==='signup' && (
                <div>
                  <label className="text-sm opacity-70">{t('confirmPassword')}</label>
                  <input type="password" required value={confirm} onChange={e=>setConfirm(e.target.value)} className="mt-1 w-full bg-white/10 dark:bg-white/5 border border-white/20 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-pink-400" />
                </div>
              )}
              {(localError || error) && <div className="text-red-400 text-xs">{localError || error}</div>}
              <button disabled={loading} className="control-btn w-full">{loading ? t('submitting') : (mode==='signin'? t('signIn'): t('signUp'))}</button>
              <div className="text-xs text-center opacity-70">
                {mode==='signin' ? (
                  <button type="button" onClick={()=>setMode('signup')} className="underline">{t('switchToSignUp')}</button>
                ) : (
                  <button type="button" onClick={()=>setMode('signin')} className="underline">{t('switchToSignIn')}</button>
                )}
              </div>
            </form>
          )}
        </div>
      </div>
      <footer className="text-center py-4 text-xs opacity-60">{t('footer')}</footer>
    </div>
  );
}
