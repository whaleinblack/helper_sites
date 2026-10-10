import { useEffect, useState } from 'react';
import { Download, Eye } from 'lucide-react';
import { fileUrl } from '../api';
import { fmtBytes, fmtDateLong, typeLabel } from '../format';
import { FileIcon } from './FileIcon';
import type { ViewItem } from './FileView';
import { PreviewBody } from './Preview';

export function DetailsPane({
  selected: live,
  folderName,
  folderCount,
  onPreview,
  onDownload,
}: {
  selected: ViewItem[];
  folderName: string;
  folderCount: number;
  onPreview: (item: ViewItem) => void;
  onDownload: () => void;
}) {
  // Follow the selection with a short delay so sweeping a marquee or holding an arrow key
  // doesn't mount (and fetch) a preview for every item passed over.
  const [selected, setSelected] = useState(live);
  useEffect(() => {
    if (live === selected) return;
    const t = setTimeout(() => setSelected(live), live.length === 1 ? 180 : 60);
    return () => clearTimeout(t);
  }, [live, selected]);

  if (selected.length === 0) {
    return (
      <aside className="details-pane empty" aria-label="详细信息">
        <FileIcon entry={{ name: folderName, type: 'dir', items: folderCount }} size={96} />
        <strong>{folderName}</strong>
        <span className="muted">{folderCount} 个项目</span>
        <p className="muted small">选择一个文件以查看预览和详细信息</p>
      </aside>
    );
  }
  if (selected.length > 1) {
    const size = selected.reduce((s, i) => s + (i.entry.type === 'file' ? i.entry.size : 0), 0);
    const dirs = selected.filter((i) => i.entry.type === 'dir').length;
    return (
      <aside className="details-pane empty" aria-label="详细信息">
        <div className="stack-icons">
          {selected.slice(0, 3).map((i) => (
            <FileIcon key={i.key} entry={i.entry} size={72} />
          ))}
        </div>
        <strong>已选择 {selected.length} 个项目</strong>
        <span className="muted">
          {selected.length - dirs} 个文件{dirs ? `，${dirs} 个文件夹` : ''} · {fmtBytes(size)}
          {dirs ? '（不含文件夹）' : ''}
        </span>
        <button className="btn" onClick={onDownload}>
          <Download size={16} /> 打包下载
        </button>
      </aside>
    );
  }
  const item = selected[0];
  const e = item.entry;
  return (
    <aside className="details-pane" aria-label="详细信息">
      <div className="pane-preview">
        {e.type === 'dir' ? (
          <div className="pane-media">
            <FileIcon entry={e} size={112} />
          </div>
        ) : (
          <PreviewBody key={item.key} item={item} compact />
        )}
      </div>
      <div className="pane-info">
        <h3 title={e.name}>{e.name}</h3>
        <span className="muted small">{typeLabel(e)}</span>
        {e.type === 'file' && (
          <div className="pane-actions">
            <button className="btn small" onClick={() => onPreview(item)}>
              <Eye size={15} /> 预览
            </button>
            <a className="btn small" href={fileUrl(item.path, true)} download>
              <Download size={15} /> 下载
            </a>
          </div>
        )}
        <dl>
          {e.type === 'file' ? (
            <>
              <dt>大小</dt>
              <dd>
                {fmtBytes(e.size, 2)}
                <span className="muted"> · {e.size.toLocaleString('zh-CN')} 字节</span>
              </dd>
            </>
          ) : (
            <>
              <dt>包含</dt>
              <dd>{e.items ?? 0} 个项目</dd>
            </>
          )}
          <dt>修改日期</dt>
          <dd>{fmtDateLong(e.mtime)}</dd>
          <dt>创建日期</dt>
          <dd>{fmtDateLong(e.ctime)}</dd>
          <dt>位置</dt>
          <dd className="mono">{item.path.slice(0, item.path.lastIndexOf('/')) || '/'}</dd>
        </dl>
      </div>
    </aside>
  );
}
