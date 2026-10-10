import { useState } from 'react';
import { Eye, EyeOff, LockKeyhole, LogIn } from 'lucide-react';
import { api } from '../api';
import { Logo } from './Logo';

export function Login({ onLogin }: { onLogin: (user: string) => void }) {
  const [username, setUsername] = useState(() => {
    try {
      return localStorage.getItem('drive.lastUser') ?? '';
    } catch {
      return '';
    }
  });
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) return setError('请输入用户名和密码');
    setBusy(true);
    setError('');
    try {
      const r = await api.login(username.trim(), password, true);
      try {
        localStorage.setItem('drive.lastUser', username.trim());
      } catch {
        /* ignore */
      }
      onLogin(r.user);
    } catch (err) {
      setError((err as Error).message);
      setPassword('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="login-page">
      <div className="login-glow" aria-hidden="true" />
      <form className="login-card" onSubmit={submit} noValidate>
        <div className="login-brand">
          <Logo size={48} />
          <div>
            <h1>出发网盘</h1>
            <p>私人文件中转站</p>
          </div>
        </div>
        <label className="field">
          <span>用户名</span>
          <input
            name="username"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            value={username}
            autoFocus={!username}
            onChange={(e) => setUsername(e.target.value)}
          />
        </label>
        <label className="field">
          <span>密码</span>
          <span className="password-wrap">
            <input
              name="password"
              type={show ? 'text' : 'password'}
              autoComplete="current-password"
              value={password}
              autoFocus={!!username}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button type="button" className="icon-btn ghost" onClick={() => setShow((v) => !v)} aria-label={show ? '隐藏密码' : '显示密码'}>
              {show ? <EyeOff size={17} /> : <Eye size={17} />}
            </button>
          </span>
        </label>
        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}
        <button className="btn primary block" disabled={busy}>
          <LogIn size={17} /> {busy ? '正在登录…' : '登录'}
        </button>
        <p className="login-foot">
          <LockKeyhole size={13} /> HTTPS 加密传输 · 登录状态保留 7 天
        </p>
      </form>
    </main>
  );
}
