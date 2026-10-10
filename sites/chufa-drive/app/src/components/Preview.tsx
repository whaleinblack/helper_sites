import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  Maximize,
  Minus,
  Plus,
  RotateCw,
  Scan,
  WrapText,
  X,
} from 'lucide-react';
import { fileUrl, type Entry } from '../api';
import { extOf, fmtBytes, fmtDate, previewMode, typeLabel, type PreviewMode } from '../format';
import { parseDelimited, renderMarkdown } from '../markdown';
import { FileIcon } from './FileIcon';
import type { ViewItem } from './FileView';

const TEXT_LIMIT = 2 * 1024 * 1024;
const ENCODINGS = ['utf-8', 'gb18030', 'shift_jis', 'big5', 'euc-kr', 'utf-16le'] as const;
const ENC_LABEL: Record<string, string> = {
  'utf-8': 'UTF-8',
  gb18030: '简体中文 (GBK)',
  shift_jis: '日本語 (Shift_JIS)',
  big5: '繁體中文 (Big5)',
  'euc-kr': '한국어 (EUC-KR)',
  'utf-16le': 'UTF-16 LE',
};

function decodeBest(buf: ArrayBuffer): { text: string; encoding: string; binary: boolean } {
  const bytes = new Uint8Array(buf);
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return { text: new TextDecoder('utf-16le').decode(bytes), encoding: 'utf-16le', binary: false };
  const sample = bytes.subarray(0, 8192);
  let nul = 0;
  for (const b of sample) if (b === 0) nul++;
  if (nul > 8) return { text: '', encoding: 'utf-8', binary: true };
  try {
    return { text: new TextDecoder('utf-8', { fatal: true }).decode(bytes), encoding: 'utf-8', binary: false };
  } catch {
    // truncated multi-byte sequence at the 2 MB cut is fine; retry non-fatally
  }
  let best = { text: '', encoding: 'utf-8', bad: Infinity };
  for (const enc of ['utf-8', 'gb18030', 'shift_jis', 'big5']) {
    const text = new TextDecoder(enc).decode(bytes);
    const bad = (text.match(/�/g) ?? []).length;
    if (bad < best.bad) best = { text, encoding: enc, bad };
  }
  return { text: best.text, encoding: best.encoding, binary: false };
}

function useText(path: string | null, enabled: boolean) {
  const [state, setState] = useState<{ buf?: ArrayBuffer; truncated?: boolean; error?: string } | null>(null);
  useEffect(() => {
    if (!path || !enabled) return;
    const ac = new AbortController();
    setState(null);
    fetch(fileUrl(path), { headers: { Range: `bytes=0-${TEXT_LIMIT - 1}` }, signal: ac.signal, credentials: 'same-origin' })
      .then(async (r) => {
        if (!r.ok) throw new Error(`无法读取文件（${r.status}）`);
        const total = Number(r.headers.get('content-range')?.split('/')[1] ?? r.headers.get('content-length'));
        const buf = await r.arrayBuffer();
        setState({ buf, truncated: Number.isFinite(total) && total > buf.byteLength });
      })
      .catch((e) => e.name !== 'AbortError' && setState({ error: e.message }));
    return () => ac.abort();
  }, [path, enabled]);
  return state;
}

function TextPreview({ item, mode, compact }: { item: ViewItem; mode: PreviewMode; compact?: boolean }) {
  const data = useText(item.path, true);
  const [encoding, setEncoding] = useState<string | null>(null);
  const [wrap, setWrap] = useState(true);
  const [raw, setRaw] = useState(false);
  useEffect(() => {
    setEncoding(null);
    setRaw(false);
  }, [item.path]);
  const decoded = useMemo(() => {
    if (!data?.buf) return null;
    if (encoding) return { text: new TextDecoder(encoding).decode(data.buf), encoding, binary: false };
    return decodeBest(data.buf);
  }, [data, encoding]);

  if (data?.error) return <div className="preview-message error">{data.error}</div>;
  if (!decoded) return <div className="preview-message">正在加载…</div>;
  if (decoded.binary) return <Unsupported item={item} note="这看起来是二进制文件，无法以文本方式预览。" />;

  const text = compact ? decoded.text.slice(0, 20000) : decoded.text;
  let body: React.ReactNode;
  if (mode === 'markdown' && !raw) {
    body = <article className="markdown" dangerouslySetInnerHTML={{ __html: renderMarkdown(text) }} />;
  } else if (mode === 'table' && !raw) {
    const rows = parseDelimited(text, extOf(item.entry.name) === 'tsv' ? '\t' : text.slice(0, 2000).split(';').length > text.slice(0, 2000).split(',').length ? ';' : ',', compact ? 100 : 2000);
    body = (
      <div className="csv-wrap">
        <table className="csv">
          <thead>
            <tr>
              <th className="rownum">#</th>
              {rows[0]?.map((c, i) => <th key={i}>{c}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.slice(1).map((r, i) => (
              <tr key={i}>
                <td className="rownum">{i + 1}</td>
                {r.map((c, j) => <td key={j}>{c}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  } else {
    let shown = text;
    if (mode === 'json' && !raw) {
      try {
        shown = JSON.stringify(JSON.parse(text), null, 2);
      } catch {
        /* show as-is */
      }
    }
    const lines = shown.split(/\r?\n/);
    body = (
      <div className={`code ${wrap ? 'wrap' : ''}`}>
        <pre className="gutter" aria-hidden="true">
          {lines.map((_, i) => `${i + 1}\n`).join('')}
        </pre>
        <pre className="code-text">{shown}</pre>
      </div>
    );
  }
  if (compact) return <div className="pane-text">{body}</div>;
  return (
    <div className="text-preview">
      <div className="text-toolbar">
        <label>
          编码
          <select value={encoding ?? decoded.encoding} onChange={(e) => setEncoding(e.target.value)}>
            {ENCODINGS.map((e) => (
              <option key={e} value={e}>
                {ENC_LABEL[e]}
              </option>
            ))}
          </select>
        </label>
        {(mode === 'markdown' || mode === 'table' || mode === 'json') && (
          <button className="chip" onClick={() => setRaw((v) => !v)}>
            {raw ? '显示渲染结果' : '查看源文本'}
          </button>
        )}
        {(raw || (mode !== 'markdown' && mode !== 'table')) && (
          <button className={`chip ${wrap ? 'on' : ''}`} onClick={() => setWrap((v) => !v)}>
            <WrapText size={14} /> 自动换行
          </button>
        )}
        {data?.truncated && <span className="muted">文件较大，仅显示前 2 MB</span>}
      </div>
      {body}
    </div>
  );
}

function Unsupported({ item, note }: { item: ViewItem; note?: string }) {
  return (
    <div className="preview-unsupported">
      <FileIcon entry={item.entry} size={112} />
      <strong>{item.entry.name}</strong>
      <span className="muted">
        {typeLabel(item.entry)} · {fmtBytes(item.entry.size)}
      </span>
      <p>{note ?? '此类型暂不支持在线预览，可以下载后用本地程序打开。'}</p>
      <a className="btn primary" href={fileUrl(item.path, true)} download>
        <Download size={16} /> 下载
      </a>
    </div>
  );
}

function ImageViewer({ item }: { item: ViewItem }) {
  const [scale, setScale] = useState<number | null>(null); // null = fit
  const [rot, setRot] = useState(0);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [natural, setNatural] = useState({ w: 0, h: 0 });
  const [error, setError] = useState(false);
  const stage = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setScale(null);
    setRot(0);
    setPos({ x: 0, y: 0 });
    setError(false);
    setNatural({ w: 0, h: 0 });
  }, [item.path]);

  const fitScale = useCallback(() => {
    const el = stage.current;
    if (!el || !natural.w) return 1;
    const swap = rot % 180 !== 0;
    const w = swap ? natural.h : natural.w;
    const h = swap ? natural.w : natural.h;
    return Math.min(1, (el.clientWidth - 32) / w, (el.clientHeight - 32) / h);
  }, [natural, rot]);

  const current = scale ?? fitScale();
  const zoomTo = (next: number, cx?: number, cy?: number) => {
    const s = Math.min(20, Math.max(0.05, next));
    const el = stage.current;
    if (el && cx != null && cy != null) {
      const r = el.getBoundingClientRect();
      const ox = cx - r.left - r.width / 2;
      const oy = cy - r.top - r.height / 2;
      const k = s / current;
      setPos((p) => ({ x: ox - (ox - p.x) * k, y: oy - (oy - p.y) * k }));
    }
    setScale(s);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '+' || e.key === '=') zoomTo(current * 1.25);
      else if (e.key === '-') zoomTo(current / 1.25);
      else if (e.key === '0') {
        setScale(null);
        setPos({ x: 0, y: 0 });
      } else if (e.key.toLowerCase() === 'r') setRot((r) => r + 90);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      zoomTo(current * (e.deltaY < 0 ? 1.15 : 1 / 1.15), e.clientX, e.clientY);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  });

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const start = { x: e.clientX, y: e.clientY, px: pos.x, py: pos.y };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => setPos({ x: start.px + ev.clientX - start.x, y: start.py + ev.clientY - start.y });
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  if (error) return <Unsupported item={item} note="图片无法显示，可能格式不受浏览器支持。" />;
  return (
    <div className="image-viewer">
      <div
        className="image-stage"
        ref={stage}
        onPointerDown={onPointerDown}
        onDoubleClick={(e) => (scale === null ? zoomTo(1, e.clientX, e.clientY) : (setScale(null), setPos({ x: 0, y: 0 })))}
      >
        <img
          src={fileUrl(item.path)}
          alt={item.entry.name}
          draggable={false}
          onLoad={(e) => setNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
          onError={() => setError(true)}
          style={{
            width: natural.w || undefined,
            transform: `translate(-50%, -50%) translate(${pos.x}px, ${pos.y}px) scale(${current}) rotate(${rot}deg)`,
            opacity: natural.w ? 1 : 0,
          }}
        />
      </div>
      <div className="image-tools" onPointerDown={(e) => e.stopPropagation()}>
        <button className="icon-btn" onClick={() => zoomTo(current / 1.25)} aria-label="缩小" title="缩小 (-)">
          <Minus size={16} />
        </button>
        <span className="zoom-label">{Math.round(current * 100)}%</span>
        <button className="icon-btn" onClick={() => zoomTo(current * 1.25)} aria-label="放大" title="放大 (+)">
          <Plus size={16} />
        </button>
        <button className="icon-btn" onClick={() => (setScale(null), setPos({ x: 0, y: 0 }))} aria-label="适应窗口" title="适应窗口 (0)">
          <Scan size={16} />
        </button>
        <button className="icon-btn" onClick={() => (setScale(1), setPos({ x: 0, y: 0 }))} aria-label="实际大小" title="实际大小">
          <Maximize size={16} />
        </button>
        <button className="icon-btn" onClick={() => setRot((r) => r + 90)} aria-label="旋转" title="旋转 (R)">
          <RotateCw size={16} />
        </button>
        {natural.w > 0 && (
          <span className="muted small">
            {natural.w} × {natural.h}
          </span>
        )}
      </div>
    </div>
  );
}

export function PreviewBody({ item, compact }: { item: ViewItem; compact?: boolean }) {
  const mode = previewMode(item.entry);
  const url = fileUrl(item.path);
  switch (mode) {
    case 'image':
      return compact ? (
        <div className="pane-media">
          <img src={url} alt={item.entry.name} />
        </div>
      ) : (
        <ImageViewer item={item} />
      );
    case 'video':
      return (
        <div className={compact ? 'pane-media' : 'media-stage'}>
          <video key={url} src={url} controls autoPlay={!compact} playsInline preload="metadata" />
        </div>
      );
    case 'audio':
      return (
        <div className={compact ? 'pane-media audio' : 'media-stage audio'}>
          <div className="audio-card">
            <FileIcon entry={item.entry} size={compact ? 72 : 120} />
            {!compact && <strong>{item.entry.name}</strong>}
            <audio key={url} src={url} controls autoPlay={!compact} preload="metadata" />
          </div>
        </div>
      );
    case 'pdf':
      return <iframe className={compact ? 'pane-pdf' : 'pdf-frame'} src={url} title={item.entry.name} />;
    case 'text':
    case 'markdown':
    case 'table':
    case 'json':
      if (item.entry.size === 0) return <div className="preview-message">空文件</div>;
      return <TextPreview item={item} mode={mode} compact={compact} />;
    default:
      return compact ? (
        <div className="pane-media">
          <FileIcon entry={item.entry} size={96} />
        </div>
      ) : (
        <Unsupported item={item} />
      );
  }
}

export function Preview({ items, startKey, onClose }: { items: ViewItem[]; startKey: string; onClose: () => void }) {
  const files = useMemo(() => items.filter((i) => i.entry.type === 'file'), [items]);
  const [index, setIndex] = useState(() => Math.max(0, files.findIndex((f) => f.key === startKey)));
  const item = files[index];
  const go = useCallback((d: number) => setIndex((i) => (files.length ? (i + d + files.length) % files.length : 0)), [files.length]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      const typing = t.closest('input, select, textarea, video, audio');
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (!typing && (e.key === 'ArrowRight' || e.key === 'PageDown')) go(1);
      else if (!typing && (e.key === 'ArrowLeft' || e.key === 'PageUp')) go(-1);
      else if (!typing && e.key === ' ' && previewMode(item?.entry ?? { name: '', type: 'file' }) === 'image') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [go, onClose, item]);

  // preload neighbouring images
  useEffect(() => {
    for (const d of [1, -1]) {
      const n = files[(index + d + files.length) % files.length];
      if (n && previewMode(n.entry) === 'image' && n.entry.size < 30 * 1024 * 1024) new Image().src = fileUrl(n.path);
    }
  }, [index, files]);

  if (!item) return null;
  const inlineable = ['image', 'video', 'audio', 'pdf', 'text', 'json', 'markdown', 'table'].includes(previewMode(item.entry));
  return (
    <div className="preview" role="dialog" aria-modal="true" aria-label={`预览 ${item.entry.name}`} onContextMenu={(e) => e.stopPropagation()}>
      <header className="preview-head">
        <div className="preview-title">
          <FileIcon entry={item.entry} size={22} />
          <strong title={item.entry.name}>{item.entry.name}</strong>
          <span className="muted small">
            {fmtBytes(item.entry.size)} · {fmtDate(item.entry.mtime)}
            {files.length > 1 && ` · ${index + 1} / ${files.length}`}
          </span>
        </div>
        <div className="preview-actions">
          {inlineable && (
            <a className="icon-btn" href={fileUrl(item.path)} target="_blank" rel="noopener" title="在新标签页打开" aria-label="在新标签页打开">
              <ExternalLink size={18} />
            </a>
          )}
          <a className="icon-btn" href={fileUrl(item.path, true)} download title="下载" aria-label="下载">
            <Download size={18} />
          </a>
          <button className="icon-btn" onClick={onClose} title="关闭 (Esc)" aria-label="关闭">
            <X size={20} />
          </button>
        </div>
      </header>
      <div className="preview-body">
        <PreviewBody key={item.key} item={item} />
        {files.length > 1 && (
          <>
            <button className="preview-nav prev" onClick={() => go(-1)} aria-label="上一个">
              <ChevronLeft size={28} />
            </button>
            <button className="preview-nav next" onClick={() => go(1)} aria-label="下一个">
              <ChevronRight size={28} />
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export function describeEntry(e: Entry) {
  return `${typeLabel(e)} · ${e.type === 'dir' ? `${e.items ?? 0} 项` : fmtBytes(e.size)}`;
}
