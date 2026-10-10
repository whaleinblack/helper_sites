import { useEffect, useRef, useState } from 'react';
import { Check, Copy, ExternalLink, Link2, ListChecks } from 'lucide-react';
import { api, EXPIRY_OPTIONS, shareLink, type EntryType, type Share } from '../api';
import { fmtDate, fmtExpiry } from '../format';
import { FileIcon } from './FileIcon';
import { Modal } from './Modal';

const PREF_KEY = 'drive.shareExpiry';

function loadExpiryChoice(): number {
  try {
    const raw = localStorage.getItem(PREF_KEY);
    const i = raw === null ? NaN : Number(raw);
    return Number.isInteger(i) && i >= 0 && i < EXPIRY_OPTIONS.length ? i : 2; // default 7 days
  } catch {
    return 2;
  }
}

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // fallback for non-secure contexts / denied permission
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}

export function ShareDialog({
  paths,
  names,
  types,
  close,
  onManage,
}: {
  paths: string[];
  names: string[];
  types: EntryType[];
  close: () => void;
  onManage: () => void;
}) {
  const [choice, setChoice] = useState(loadExpiryChoice);
  const [share, setShare] = useState<Share | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const linkRef = useRef<HTMLInputElement>(null);

  const zipped = paths.length > 1 || types[0] === 'dir';
  const label = paths.length === 1 ? names[0] : `${names[0]} 等 ${paths.length} 项`;

  const create = async () => {
    setBusy(true);
    setError('');
    try {
      try {
        localStorage.setItem(PREF_KEY, String(choice));
      } catch {
        /* ignore */
      }
      const s = await api.createShare(paths, EXPIRY_OPTIONS[choice].seconds);
      setShare(s);
      setCopied(await copyToClipboard(shareLink(s.url)));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (share) linkRef.current?.select();
  }, [share]);

  const copy = async () => {
    if (!share) return;
    setCopied(await copyToClipboard(shareLink(share.url)));
    linkRef.current?.select();
  };

  return (
    <Modal
      title="生成下载链接"
      icon={<Link2 size={18} />}
      onClose={close}
      width={500}
      footer={
        share ? (
          <>
            <button className="btn ghost-left" onClick={() => (close(), onManage())}>
              <ListChecks size={16} /> 管理所有链接
            </button>
            <button className="btn primary" onClick={close}>
              完成
            </button>
          </>
        ) : (
          <>
            <button className="btn ghost-left" onClick={() => (close(), onManage())}>
              <ListChecks size={16} /> 管理所有链接
            </button>
            <button className="btn" onClick={close}>
              取消
            </button>
            <button className="btn primary" disabled={busy} onClick={create} data-autofocus>
              <Link2 size={16} /> {busy ? '正在生成…' : '生成链接'}
            </button>
          </>
        )
      }
    >
      <div className="share-target">
        <FileIcon entry={{ name: names[0], type: paths.length > 1 ? 'dir' : types[0], items: 1 }} size={40} />
        <div>
          <strong title={names.join('\n')}>{label}</strong>
          <span className="muted small">{zipped ? '对方将下载一个 ZIP 压缩包' : '对方可直接下载或在线预览此文件'}</span>
        </div>
      </div>

      {!share ? (
        <>
          <div className="field-label">链接有效期</div>
          <div className="segmented" role="radiogroup" aria-label="链接有效期">
            {EXPIRY_OPTIONS.map((o, i) => (
              <button key={o.label} role="radio" aria-checked={choice === i} className={choice === i ? 'on' : ''} onClick={() => setChoice(i)}>
                {o.label}
              </button>
            ))}
          </div>
          <p className="share-note muted small">任何拿到链接的人都无需登录即可下载。可随时在“分享链接”中取消或修改有效期。</p>
        </>
      ) : (
        <>
          <div className="field-label">下载链接</div>
          <div className="link-box">
            <input ref={linkRef} readOnly value={shareLink(share.url)} onFocus={(e) => e.currentTarget.select()} aria-label="下载链接" />
            <button className={`btn ${copied ? '' : 'primary'}`} onClick={copy}>
              {copied ? <Check size={16} /> : <Copy size={16} />} {copied ? '已复制' : '复制'}
            </button>
            <a className="icon-btn" href={share.url} target="_blank" rel="noopener" title="在新标签页打开" aria-label="在新标签页打开">
              <ExternalLink size={17} />
            </a>
          </div>
          <p className="share-note small">
            {share.expiresAt ? (
              <>
                有效期至 <strong>{fmtDate(share.expiresAt)}</strong>（{fmtExpiry(share.expiresAt).text}）
              </>
            ) : (
              <strong>永久有效</strong>
            )}
            {copied && <span className="ok"> · 链接已复制到剪贴板</span>}
          </p>
        </>
      )}
      {error && <p className="field-error">{error}</p>}
    </Modal>
  );
}
