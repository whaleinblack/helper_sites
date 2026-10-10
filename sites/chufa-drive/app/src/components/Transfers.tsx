import { memo, useState, useSyncExternalStore } from 'react';
import { CheckCircle2, ChevronDown, ChevronUp, CircleSlash, RotateCcw, X, XCircle } from 'lucide-react';
import { fmtBytes, fmtDuration } from '../format';
import { uploader, type UploadTask } from '../uploader';
import { FileIcon } from './FileIcon';

function statusText(t: UploadTask) {
  switch (t.status) {
    case 'queued':
      return '等待中';
    case 'uploading':
      return t.error ?? `${fmtBytes(t.loaded)} / ${fmtBytes(t.file.size)}${t.speed ? ` · ${fmtBytes(t.speed)}/s` : ''}`;
    case 'done':
      return t.savedAs && t.savedAs !== t.relPath.split('/').pop() ? `已保存为 ${t.savedAs}` : '已完成';
    case 'skipped':
      return '已跳过';
    case 'canceled':
      return '已取消';
    case 'error':
      return t.error ?? '失败';
  }
}

export const Transfers = memo(function Transfers({ onOpenDir }: { onOpenDir: (dir: string) => void }) {
  const tasks = useSyncExternalStore(uploader.subscribe, uploader.getSnapshot);
  const [collapsed, setCollapsed] = useState(false);
  if (!tasks.length) return null;

  const active = tasks.filter((t) => t.status === 'queued' || t.status === 'uploading');
  const failed = tasks.filter((t) => t.status === 'error');
  const total = tasks.filter((t) => t.status !== 'canceled').reduce((s, t) => s + t.file.size, 0);
  const loaded = tasks.filter((t) => t.status !== 'canceled').reduce((s, t) => s + (t.status === 'skipped' ? t.file.size : t.loaded), 0);
  const speed = tasks.filter((t) => t.status === 'uploading').reduce((s, t) => s + t.speed, 0);
  const pct = total ? Math.min(100, (loaded / total) * 100) : 100;
  const remaining = speed > 0 ? (total - loaded) / speed : NaN;

  let title: string;
  if (active.length) title = `正在上传 ${active.length} 个文件`;
  else if (failed.length) title = `${failed.length} 个文件上传失败`;
  else title = `上传完成（${tasks.filter((t) => t.status === 'done').length} 个）`;

  const shown = tasks.slice(-300).reverse();

  return (
    <section className={`transfers ${collapsed ? 'collapsed' : ''}`} aria-label="上传任务">
      <header className="transfers-head">
        <div className="transfers-title">
          <strong>{title}</strong>
          <span className="muted small">
            {active.length ? `${pct.toFixed(0)}% · ${fmtBytes(loaded)} / ${fmtBytes(total)}${speed ? ` · ${fmtBytes(speed)}/s · 剩余 ${fmtDuration(remaining)}` : ''}` : `${fmtBytes(total)}`}
          </span>
        </div>
        {failed.length > 0 && (
          <button className="icon-btn" title="重试失败项" aria-label="重试失败项" onClick={() => uploader.retryFailed()}>
            <RotateCcw size={16} />
          </button>
        )}
        <button className="icon-btn" title={collapsed ? '展开' : '收起'} aria-label={collapsed ? '展开' : '收起'} onClick={() => setCollapsed((v) => !v)}>
          {collapsed ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </button>
        <button
          className="icon-btn"
          title={active.length ? '全部取消' : '关闭'}
          aria-label={active.length ? '全部取消' : '关闭'}
          onClick={() => (active.length ? uploader.cancelAll() : uploader.clearFinished())}
        >
          <X size={18} />
        </button>
      </header>
      <div className="transfers-bar">
        <span style={{ width: `${pct}%` }} className={failed.length && !active.length ? 'error' : ''} />
      </div>
      {!collapsed && (
        <ul className="transfers-list">
          {shown.map((t) => {
            const p = t.file.size ? (t.loaded / t.file.size) * 100 : t.status === 'done' ? 100 : 0;
            return (
              <li key={t.id} className={`transfer ${t.status}`}>
                <FileIcon entry={{ name: t.file.name, type: 'file' }} size={30} />
                <div className="transfer-main">
                  <span className="transfer-name" title={t.relPath}>
                    {t.relPath}
                  </span>
                  <button className="transfer-dir" onClick={() => onOpenDir(t.dir)} title="打开目标文件夹">
                    {t.dir === '/' ? '我的网盘' : t.dir}
                  </button>
                  {(t.status === 'uploading' || t.status === 'queued') && (
                    <span className="transfer-progress">
                      <span style={{ width: `${p}%` }} />
                    </span>
                  )}
                  <span className={`transfer-status ${t.status === 'error' ? 'error' : ''}`}>{statusText(t)}</span>
                </div>
                <div className="transfer-action">
                  {t.status === 'done' && <CheckCircle2 size={18} className="ok" />}
                  {t.status === 'skipped' && <CircleSlash size={18} className="muted" />}
                  {(t.status === 'uploading' || t.status === 'queued') && (
                    <button className="icon-btn small" onClick={() => uploader.cancel(t.id)} aria-label="取消" title="取消">
                      <XCircle size={17} />
                    </button>
                  )}
                  {(t.status === 'error' || t.status === 'canceled') && (
                    <button className="icon-btn small" onClick={() => uploader.retry(t.id)} aria-label="重试" title="重试">
                      <RotateCcw size={16} />
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
});
