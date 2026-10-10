import { memo, useCallback, useEffect, useState } from 'react';
import { ChevronRight, HardDrive, Link2, Trash2 } from 'lucide-react';
import { api, joinPath, segmentsOf, type Entry, type Storage } from '../api';
import { fmtBytes } from '../format';
import { FolderIcon } from './FileIcon';

interface Props {
  current: string | null;
  inTrash: boolean;
  inShares: boolean;
  onShares: () => void;
  version: number;
  storage: Storage | null;
  onNavigate: (path: string) => void;
  onTrash: () => void;
  canDrop: (path: string, e: React.DragEvent) => boolean;
  onDrop: (path: string, e: React.DragEvent) => void;
  onContextMenu: (e: React.MouseEvent, path: string) => void;
}

const loadExpanded = () => {
  try {
    return new Set<string>(JSON.parse(localStorage.getItem('drive.tree') ?? '["/"]'));
  } catch {
    return new Set(['/']);
  }
};

export const Sidebar = memo(function Sidebar(props: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(loadExpanded);
  const [children, setChildren] = useState<Map<string, Entry[]>>(new Map());
  const [dropPath, setDropPath] = useState<string | null>(null);

  const load = useCallback(async (path: string) => {
    try {
      const r = await api.list(path);
      const dirs = r.entries
        .filter((e) => e.type === 'dir')
        .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN', { numeric: true }));
      setChildren((m) => new Map(m).set(path, dirs));
    } catch {
      setChildren((m) => {
        const n = new Map(m);
        n.delete(path);
        return n;
      });
    }
  }, []);

  // expand ancestors of the current folder
  useEffect(() => {
    if (!props.current) return;
    const segs = segmentsOf(props.current);
    setExpanded((prev) => {
      const next = new Set(prev);
      next.add('/');
      for (let i = 1; i < segs.length; i++) next.add('/' + segs.slice(0, i).join('/'));
      return next;
    });
  }, [props.current]);

  useEffect(() => {
    for (const p of expanded) load(p);
    try {
      localStorage.setItem('drive.tree', JSON.stringify([...expanded].slice(0, 200)));
    } catch {
      /* storage unavailable */
    }
    // reload whenever the tree shape or data version changes
  }, [expanded, props.version, load]);

  const toggle = (path: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });

  const dropHandlers = (path: string) => ({
    onDragOver: (e: React.DragEvent) => {
      if (!props.canDrop(path, e)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = e.dataTransfer.types.includes('Files') || e.ctrlKey ? 'copy' : 'move';
      setDropPath(path);
    },
    onDragLeave: () => setDropPath((p) => (p === path ? null : p)),
    onDrop: (e: React.DragEvent) => {
      setDropPath(null);
      if (!props.canDrop(path, e)) return;
      e.preventDefault();
      props.onDrop(path, e);
    },
  });

  const renderNode = (path: string, name: string, depth: number, hasDirs: boolean, filled: boolean) => {
    const open = expanded.has(path);
    const kids = children.get(path);
    const active = !props.inTrash && !props.inShares && props.current === path;
    return (
      <li key={path} role="treeitem" aria-expanded={hasDirs ? open : undefined} aria-selected={active}>
        <div
          className={`tree-row ${active ? 'active' : ''} ${dropPath === path ? 'drop-target' : ''}`}
          style={{ paddingLeft: 8 + depth * 14 }}
          onClick={() => props.onNavigate(path)}
          onContextMenu={(e) => {
            e.preventDefault();
            props.onContextMenu(e, path);
          }}
          {...dropHandlers(path)}
        >
          <button
            className={`tree-twisty ${hasDirs ? '' : 'hidden'} ${open ? 'open' : ''}`}
            tabIndex={-1}
            aria-label={open ? '折叠' : '展开'}
            onClick={(e) => {
              e.stopPropagation();
              toggle(path);
            }}
          >
            <ChevronRight size={14} />
          </button>
          {path === '/' ? <HardDrive size={18} className="tree-drive" /> : <FolderIcon size={20} filled={filled} open={open && hasDirs} />}
          <span className="tree-label" title={name}>
            {name}
          </span>
        </div>
        {open && kids && kids.length > 0 && (
          <ul role="group">{kids.map((k) => renderNode(joinPath(path, k.name), k.name, depth + 1, !!k.hasDirs, (k.items ?? 0) > 0))}</ul>
        )}
      </li>
    );
  };

  const s = props.storage;
  const usedPct = s ? Math.min(100, ((s.diskTotal - s.diskFree) / s.diskTotal) * 100) : 0;
  const drivePct = s ? Math.min(100, ((s.used + s.trash) / s.diskTotal) * 100) : 0;
  const reservePct = s ? Math.min(100, (s.reserve / s.diskTotal) * 100) : 0;

  return (
    <nav className="sidebar" aria-label="导航">
      <div className="side-scroll">
        <ul className="tree" role="tree" aria-label="文件夹">
          {renderNode('/', '我的网盘', 0, true, true)}
        </ul>
        <div className="side-sep" />
        <button className={`side-link ${props.inShares ? 'active' : ''}`} onClick={props.onShares}>
          <Link2 size={18} />
          <span>分享链接</span>
        </button>
        <button className={`side-link ${props.inTrash ? 'active' : ''}`} onClick={props.onTrash}>
          <Trash2 size={18} />
          <span>回收站</span>
          {s && s.trash > 0 && <span className="side-badge">{fmtBytes(s.trash)}</span>}
        </button>
      </div>
      {s && (
        <div className="storage" title={`磁盘总容量 ${fmtBytes(s.diskTotal)}，为系统保留 ${fmtBytes(s.reserve)}`}>
          <div className="storage-head">
            <span>存储空间</span>
            <strong>{fmtBytes(s.available)} 可用</strong>
          </div>
          <div className="storage-bar" aria-hidden="true">
            <span className="other" style={{ width: `${usedPct}%` }} />
            <span className="mine" style={{ width: `${drivePct}%` }} />
            <span className="reserve" style={{ width: `${reservePct}%` }} />
          </div>
          <div className="storage-legend">
            <span>
              <i className="mine" /> 网盘 {fmtBytes(s.used)}
            </span>
            {s.trash > 0 && (
              <span>
                <i className="trash" /> 回收站 {fmtBytes(s.trash)}
              </span>
            )}
          </div>
        </div>
      )}
    </nav>
  );
});
