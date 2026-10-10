import { useEffect, useState } from 'react';
import { Clock, Download, FileWarning, Package } from 'lucide-react';
import { api, ApiError, publicShareFile, type PublicShare } from '../api';
import { fmtBytes, fmtDate, fmtExpiry, previewMode, typeLabel } from '../format';
import { FileIcon } from './FileIcon';
import { Logo } from './Logo';

export function SharePage({ id }: { id: string }) {
  const [data, setData] = useState<PublicShare | null>(null);
  const [error, setError] = useState<{ title: string; text: string } | null>(null);

  useEffect(() => {
    const dark = matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    api
      .publicShare(id)
      .then((d) => {
        setData(d);
        document.title = `${d.label} - 出发网盘分享`;
      })
      .catch((e) => {
        const status = e instanceof ApiError ? e.status : 0;
        if (status === 410) setError({ title: '链接已过期', text: '这个下载链接已经过了有效期，请联系分享者重新生成。' });
        else if (status === 404) setError({ title: '链接不可用', text: e.message || '链接不存在、已被取消，或文件已被移除。' });
        else setError({ title: '加载失败', text: e.message || '请检查网络后刷新页面。' });
        document.title = '链接不可用 - 出发网盘';
      });
  }, [id]);

  const single = data?.kind === 'file' ? data.items[0] : null;
  const mode = single ? previewMode(single) : 'none';
  const exp = data ? fmtExpiry(data.expiresAt) : null;

  return (
    <main className="share-page">
      <div className="login-glow" aria-hidden="true" />
      <section className={`share-card ${single && mode !== 'none' ? 'wide' : ''}`}>
        <header className="share-brand">
          <Logo size={30} />
          <span>出发网盘 · 文件分享</span>
        </header>

        {!data && !error && (
          <div className="share-state">
            <span className="spinner" />
          </div>
        )}

        {error && (
          <div className="share-state">
            <FileWarning size={48} strokeWidth={1.4} />
            <h1>{error.title}</h1>
            <p className="muted">{error.text}</p>
          </div>
        )}

        {data && (
          <>
            {single && mode === 'image' && (
              <a className="share-preview" href={publicShareFile(id, true)} target="_blank" rel="noopener">
                <img src={publicShareFile(id, true)} alt={single.name} />
              </a>
            )}
            {single && mode === 'video' && (
              <div className="share-preview">
                <video src={publicShareFile(id, true)} controls preload="metadata" playsInline />
              </div>
            )}
            {single && mode === 'audio' && (
              <div className="share-preview audio">
                <audio src={publicShareFile(id, true)} controls preload="metadata" />
              </div>
            )}
            {single && mode === 'pdf' && (
              <div className="share-preview pdf">
                <iframe src={publicShareFile(id, true)} title={single.name} />
              </div>
            )}

            <div className="share-file">
              {data.kind === 'zip' ? (
                <span className="share-zip-icon">
                  <Package size={40} strokeWidth={1.5} />
                </span>
              ) : (
                <FileIcon entry={data.items[0]} size={56} />
              )}
              <div className="share-file-text">
                <h1 title={data.label}>{data.kind === 'zip' ? `${data.label}.zip` : data.label}</h1>
                <span className="muted">
                  {data.kind === 'zip'
                    ? `ZIP 压缩包 · ${data.items.length} 个项目 · 约 ${fmtBytes(data.total)}`
                    : `${typeLabel(data.items[0])} · ${fmtBytes(data.total)}`}
                </span>
              </div>
            </div>

            <a className="btn primary block share-download" href={publicShareFile(id)} download>
              <Download size={18} /> 下载{data.total ? `（${fmtBytes(data.total)}）` : ''}
            </a>

            <p className={`share-expiry ${exp?.soon ? 'soon' : ''}`}>
              <Clock size={14} />
              {data.expiresAt ? `链接有效期至 ${fmtDate(data.expiresAt)}（${exp?.text}）` : '链接长期有效'}
            </p>

            {data.kind === 'zip' && (
              <ul className="share-items">
                {data.items.slice(0, 100).map((it) => (
                  <li key={it.name}>
                    <FileIcon entry={it} size={22} />
                    <span className="ellipsis">{it.name}</span>
                    <span className="muted small">{it.type === 'dir' ? `${it.files ?? 0} 个文件 · ${fmtBytes(it.bytes ?? 0)}` : fmtBytes(it.size)}</span>
                  </li>
                ))}
                {data.items.length > 100 && <li className="muted small">以及另外 {data.items.length - 100} 项…</li>}
              </ul>
            )}
          </>
        )}
        <footer className="share-foot muted small">此文件由网盘用户分享 · 请勿下载来源不明的文件</footer>
      </section>
    </main>
  );
}
