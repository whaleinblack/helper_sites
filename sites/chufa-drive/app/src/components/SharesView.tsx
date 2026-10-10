import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Copy, Download, ExternalLink, FolderOpen, Link2, Trash2 } from 'lucide-react';
import { api, EXPIRY_OPTIONS, parentOf, shareLink, type Share } from '../api';
import { fmtDate, fmtExpiry } from '../format';
import { useDialogs } from './Dialogs';
import { FileIcon } from './FileIcon';
import { copyToClipboard } from './ShareDialog';

export function SharesView({
  version,
  onOpenLocation,
  notify,
}: {
  version: number;
  onOpenLocation: (path: string) => void;
  notify: (text: string, tone?: 'ok' | 'error' | 'info') => void;
}) {
  const dialogs = useDialogs();
  const [shares, setShares] = useState<Share[] | null>(null);
  const [error, setError] = useState('');
  const [, tick] = useState(0);

  const load = useCallback(async () => {
    try {
      setError('');
      setShares((await api.shares()).shares);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load, version]);

  // keep "剩余 …" labels fresh
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, []);

  const copy = async (s: Share) => notify((await copyToClipboard(shareLink(s.url))) ? '链接已复制' : '复制失败，请手动复制', 'ok');

  const revoke = async (list: Share[]) => {
    if (!list.length) return;
    const ok = await dialogs.confirm({
      title: '取消分享',
      message: list.length === 1 ? `取消后，“${list[0].label}”的链接将立即失效。文件本身不会被删除。` : `将取消 ${list.length} 个链接，它们会立即失效。文件本身不会被删除。`,
      confirmText: '取消分享',
      danger: true,
    });
    if (!ok) return;
    try {
      await api.deleteShares(list.map((s) => s.id));
      notify(list.length === 1 ? '链接已取消' : `已取消 ${list.length} 个链接`, 'ok');
      load();
    } catch (e) {
      notify((e as Error).message, 'error');
    }
  };

  const changeExpiry = async (s: Share, index: number) => {
    try {
      await api.updateShare(s.id, EXPIRY_OPTIONS[index].seconds);
      notify(`有效期已改为 ${EXPIRY_OPTIONS[index].label}（从现在起）`, 'ok');
      load();
    } catch (e) {
      notify((e as Error).message, 'error');
    }
  };

  if (error)
    return (
      <div className="view-empty error static">
        <p>{error}</p>
        <button className="btn" onClick={load}>
          重试
        </button>
      </div>
    );
  if (!shares)
    return (
      <div className="view-empty static">
        <span className="spinner" /> 正在加载…
      </div>
    );

  const dead = shares.filter((s) => s.missing || fmtExpiry(s.expiresAt).expired);

  return (
    <div className="shares">
      <div className="shares-head">
        <div>
          <strong>{shares.length} 个分享链接</strong>
          <span className="muted small">拿到链接的人无需登录即可下载；过期的链接会在一天后自动清除</span>
        </div>
        {dead.length > 0 && (
          <button className="btn small" onClick={() => revoke(dead)}>
            <Trash2 size={15} /> 清理失效链接（{dead.length}）
          </button>
        )}
      </div>
      {shares.length === 0 ? (
        <div className="view-empty static">
          <Link2 size={40} strokeWidth={1.4} />
          <p>还没有分享链接</p>
          <span className="muted small">在文件上点右键，选择“生成下载链接”</span>
        </div>
      ) : (
        <ul className="share-list">
          {shares.map((s) => {
            const exp = fmtExpiry(s.expiresAt);
            const bad = s.missing || exp.expired;
            return (
              <li key={s.id} className={`share-row ${bad ? 'dead' : ''}`}>
                <FileIcon entry={{ name: s.names[0], type: s.paths.length > 1 ? 'dir' : s.types[0], items: 1 }} size={36} />
                <div className="share-main">
                  <span className="share-label" title={s.paths.join('\n')}>
                    {s.label}
                    {s.paths.length > 1 && <span className="pill">{s.paths.length} 项</span>}
                    {(s.paths.length > 1 || s.types[0] === 'dir') && <span className="pill">ZIP</span>}
                  </span>
                  <span className="share-url mono" title={shareLink(s.url)}>
                    {shareLink(s.url)}
                  </span>
                  <span className="share-meta small">
                    {s.missing ? (
                      <span className="warn">
                        <AlertTriangle size={13} /> 文件已被删除或移出网盘
                      </span>
                    ) : (
                      <span className={exp.expired ? 'warn' : exp.soon ? 'soon' : ''}>{exp.text}</span>
                    )}
                    <span className="muted">创建于 {fmtDate(s.createdAt)}</span>
                    <span className="muted">
                      <Download size={12} /> {s.downloads} 次下载{s.lastDownloadAt ? `，最近 ${fmtDate(s.lastDownloadAt)}` : ''}
                    </span>
                  </span>
                </div>
                <div className="share-actions">
                  <select
                    className="expiry-select"
                    aria-label="修改有效期"
                    value=""
                    onChange={(e) => e.target.value !== '' && changeExpiry(s, Number(e.target.value))}
                  >
                    <option value="" disabled>
                      {s.expiresAt ? `至 ${fmtDate(s.expiresAt).slice(5)}` : '永久'}
                    </option>
                    {EXPIRY_OPTIONS.map((o, i) => (
                      <option key={o.label} value={i}>
                        {o.seconds ? `从现在起 ${o.label}` : o.label}
                      </option>
                    ))}
                  </select>
                  <button className="icon-btn" onClick={() => copy(s)} title="复制链接" aria-label="复制链接" disabled={bad}>
                    <Copy size={17} />
                  </button>
                  <a className="icon-btn" href={s.url} target="_blank" rel="noopener" title="打开分享页" aria-label="打开分享页">
                    <ExternalLink size={17} />
                  </a>
                  <button
                    className="icon-btn"
                    onClick={() => onOpenLocation(parentOf(s.paths[0]))}
                    title="打开所在位置"
                    aria-label="打开所在位置"
                    disabled={s.missing}
                  >
                    <FolderOpen size={17} />
                  </button>
                  <button className="icon-btn danger" onClick={() => revoke([s])} title="取消分享" aria-label="取消分享">
                    <Trash2 size={17} />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
