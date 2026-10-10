import { useCallback, useEffect, useRef, useState } from 'react';
import { api, setUnauthenticatedHandler } from './api';
import { DialogProvider } from './components/Dialogs';
import { Drive } from './components/Drive';
import { Login } from './components/Login';
import { SharePage } from './components/SharePage';
import { uploader } from './uploader';

type State = { phase: 'loading' } | { phase: 'login'; expired?: boolean } | { phase: 'ready'; user: string } | { phase: 'error'; message: string };

// Public share pages (/drive/s/<token>) never touch the logged-in UI.
const SHARE_ID = /^\/drive\/s\/([A-Za-z0-9_-]{22})\/?$/.exec(location.pathname)?.[1] ?? null;

export function App() {
  return SHARE_ID ? <SharePage id={SHARE_ID} /> : <DriveApp />;
}

function DriveApp() {
  const [unified, setUnified] = useState(false);
  useEffect(() => { fetch('/drive/api/auth-mode').then(r => r.json()).then(v => setUnified(v.unified === true)).catch(() => {}); }, []);
  const [state, setState] = useState<State>({ phase: 'loading' });
  const notifyRef = useRef<(t: string, tone?: 'ok' | 'error') => void>(() => {});

  const check = useCallback(() => {
    setState({ phase: 'loading' });
    api
      .session()
      .then((r) => setState({ phase: 'ready', user: r.user }))
      .catch((e) => (e.status === 401 ? setState({ phase: 'login' }) : setState({ phase: 'error', message: e.message })));
  }, []);

  useEffect(() => {
    // theme before first paint of the login screen
    try {
      const theme = JSON.parse(localStorage.getItem('drive.prefs') ?? '{}').theme ?? 'system';
      const dark = theme === 'dark' || (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
      document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    } catch {
      /* ignore */
    }
    setUnauthenticatedHandler(() => {
      uploader.cancelAll();
      setState({ phase: 'login', expired: true });
    });
    check();
  }, [check]);

  const logout = async () => {
    uploader.cancelAll();
    if (unified) {
      try {
        const response = await fetch('/account/api/logout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
        if (!response.ok) throw new Error('退出未成功，请重试');
        setState({ phase: 'login' });
      } catch { setState({ phase: 'error', message: '退出未成功，请重试' }); }
      return;
    }
    await api.logout().catch(() => {});
    setState({ phase: 'login' });
  };

  if (state.phase === 'loading') {
    return (
      <div className="boot">
        <span className="spinner" />
      </div>
    );
  }
  if (state.phase === 'error') {
    return (
      <div className="boot">
        <p>{state.message}</p>{unified && <a href="/account/?next=/drive/">管理统一账户</a>}
        <button className="btn" onClick={check}>
          重试
        </button>
      </div>
    );
  }
  if (state.phase === 'login' && unified) return <div className="boot"><h1>出发网盘</h1><p>使用出发网统一账号访问你的文件。</p><a className="btn" href="/account/?next=/drive/">前往统一登录</a></div>;
  if (state.phase === 'login') return <Login onLogin={(user) => setState({ phase: 'ready', user })} />;
  return (
    <DialogProvider notify={(m, t) => notifyRef.current(m, t)}>
      <Drive unified={unified} user={state.user} onLogout={logout} notifyRef={notifyRef} />
    </DialogProvider>
  );
}
