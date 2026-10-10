import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDownUp,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArchiveRestore,
  CheckSquare,
  ChevronRight,
  ClipboardPaste,
  Copy,
  Download,
  Eye,
  FileUp,
  FolderInput,
  FolderOpen,
  FolderPlus,
  FolderUp,
  HardDrive,
  Info,
  Keyboard,
  LayoutGrid,
  List,
  LogOut,
  Menu,
  Moon,
  MoreHorizontal,
  PanelRight,
  Pencil,
  RefreshCw,
  Scissors,
  Search,
  Sun,
  SunMoon,
  Trash2,
  Upload,
  UserRound,
  X,
  KeyRound,
  Link2,
  CopyPlus,
  Rows3,
} from 'lucide-react';
import {
  api,
  ApiError,
  baseName,
  fileUrl,
  joinPath,
  parentOf,
  segmentsOf,
  type ConflictMode,
  type Entry,
  type Storage,
  type TrashItem,
} from '../api';
import { fmtBytes, fmtDate, fmtKB, sortEntries, SORT_LABELS, typeLabel, type SortKey, type SortState } from '../format';
import { sourcesFromDataTransfer, sourcesFromInput, uploader, type UploadSource } from '../uploader';
import { ContextMenu, type MenuItem } from './ContextMenu';
import { DetailsPane } from './DetailsPane';
import { useDialogs } from './Dialogs';
import { FileView, VIEW_LABELS, ZOOM_ORDER, type Column, type Selection, type ViewItem, type ViewMode } from './FileView';
import { Logo } from './Logo';
import { Preview } from './Preview';
import { SharesView } from './SharesView';
import { Sidebar } from './Sidebar';
import { Transfers } from './Transfers';

type Route = { kind: 'dir'; path: string } | { kind: 'trash' } | { kind: 'shares' };
type Theme = 'system' | 'light' | 'dark';

interface Prefs {
  view: ViewMode;
  sort: SortState;
  pane: boolean;
  checkboxes: boolean;
  thumbnails: boolean;
  theme: Theme;
  cols: Record<string, number>;
}

const DEFAULT_PREFS: Prefs = {
  view: 'details',
  sort: { key: 'name', dir: 1 },
  pane: false,
  checkboxes: true,
  thumbnails: true,
  theme: 'system',
  cols: { name: 360, location: 220, mtime: 150, type: 130, size: 100, original: 240, deleted: 150 },
};

function loadPrefs(): Prefs {
  try {
    const p = JSON.parse(localStorage.getItem('drive.prefs') ?? '{}');
    return { ...DEFAULT_PREFS, ...p, cols: { ...DEFAULT_PREFS.cols, ...(p.cols ?? {}) } };
  } catch {
    return DEFAULT_PREFS;
  }
}

function parseHash(): Route {
  const h = decodeURIComponent(location.hash.slice(1));
  if (h === 'trash') return { kind: 'trash' };
  if (h === 'shares') return { kind: 'shares' };
  const segs = segmentsOf(h);
  return { kind: 'dir', path: '/' + segs.join('/') };
}

const hashFor = (r: Route) => (r.kind === 'trash' ? '#trash' : r.kind === 'shares' ? '#shares' : `#${encodeURI(r.path).replace(/#/g, '%23').replace(/\?/g, '%3F')}`);

const EMPTY_SEL: Selection = { keys: new Set(), focus: null, anchor: null };
const DRAG_TYPE = 'application/x-chufa-drive';

interface Toast {
  id: number;
  text: string;
  tone: 'ok' | 'error' | 'info';
  action?: { label: string; run: () => void };
}

/** A callback whose identity never changes but always runs the latest closure. */
function useStable<A extends unknown[], R>(fn: (...args: A) => R): (...args: A) => R {
  const ref = useRef(fn);
  ref.current = fn;
  return useCallback((...args: A) => ref.current(...args), []);
}

export function Drive({ user, onLogout, notifyRef, unified = false }: { unified?: boolean; user: string; onLogout: () => void; notifyRef: React.MutableRefObject<(t: string, tone?: 'ok' | 'error') => void> }) {
  const dialogs = useDialogs();
  const [route, setRoute] = useState<Route>(parseHash);
  const [listing, setListing] = useState<{ path: string; entries: Entry[] } | null>(null);
  const [trash, setTrash] = useState<TrashItem[] | null>(null);
  const [retention, setRetention] = useState(30);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState<{ q: string; entries: Entry[] | null; truncated?: boolean } | null>(null);
  const [searchText, setSearchText] = useState('');
  const [prefs, setPrefs] = useState<Prefs>(loadPrefs);
  const [selection, setSelection] = useState<Selection>(EMPTY_SEL);
  const [clipboard, setClipboard] = useState<{ mode: 'copy' | 'cut'; paths: string[] } | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [storage, setStorage] = useState<Storage | null>(null);
  const [treeVersion, setTreeVersion] = useState(0);
  const [sharesVersion, setSharesVersion] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [editingPath, setEditingPath] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [histIdx, setHistIdx] = useState(0);
  const [histMax, setHistMax] = useState(0);
  const [narrow, setNarrow] = useState(() => window.matchMedia('(max-width: 960px)').matches);

  const fileInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const viewRef = useRef<HTMLDivElement>(null);
  const dragging = useRef<string[] | null>(null);
  const listAbort = useRef<AbortController | null>(null);
  const toastSeq = useRef(0);
  const uploadDest = useRef('/');

  const currentDir = route.kind === 'dir' ? route.path : null;

  // ---------- toasts ----------
  const toast = useCallback((text: string, tone: Toast['tone'] = 'info', action?: Toast['action']) => {
    const id = ++toastSeq.current;
    setToasts((t) => [...t.slice(-3), { id, text, tone, action }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), action ? 7000 : tone === 'error' ? 6000 : 3500);
  }, []);
  notifyRef.current = (t, tone) => toast(t, tone ?? 'info');
  const fail = useCallback((e: unknown) => toast((e as Error).message || '操作失败', 'error'), [toast]);

  // ---------- prefs & theme ----------
  useEffect(() => {
    try {
      localStorage.setItem('drive.prefs', JSON.stringify(prefs));
    } catch {
      /* ignore */
    }
  }, [prefs]);
  useEffect(() => {
    const root = document.documentElement;
    const apply = () => {
      const dark = prefs.theme === 'dark' || (prefs.theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
      root.dataset.theme = dark ? 'dark' : 'light';
    };
    apply();
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [prefs.theme]);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 960px)');
    const on = () => setNarrow(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  const setPref = <K extends keyof Prefs>(k: K, v: Prefs[K]) => setPrefs((p) => ({ ...p, [k]: v }));

  // ---------- history ----------
  useEffect(() => {
    const st = history.state as { idx?: number } | null;
    if (st?.idx == null) history.replaceState({ idx: 0 }, '', location.href);
    const idx = (history.state as { idx: number }).idx;
    setHistIdx(idx);
    setHistMax(Number(sessionStorage.getItem('drive.histMax') ?? idx));
    const onPop = () => {
      setRoute(parseHash());
      setHistIdx((history.state as { idx?: number } | null)?.idx ?? 0);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const navigate = useCallback(
    (r: Route) => {
      setSearch(null);
      setSearchText('');
      setSidebarOpen(false);
      if (hashFor(r) === hashFor(route) || (r.kind === 'dir' && route.kind === 'dir' && r.path === route.path)) {
        return;
      }
      const idx = histIdx + 1;
      history.pushState({ idx }, '', hashFor(r));
      setHistIdx(idx);
      setHistMax(idx);
      try {
        sessionStorage.setItem('drive.histMax', String(idx));
      } catch {
        /* ignore */
      }
      setRoute(r);
    },
    [route, histIdx],
  );
  const goDir = useCallback((path: string) => navigate({ kind: 'dir', path }), [navigate]);

  // ---------- data loading ----------
  const refreshStatus = useCallback(() => {
    api
      .status()
      .then((s) => {
        setStorage(s.storage);
        uploader.chunkSize = s.chunkSize;
      })
      .catch(() => {});
  }, []);

  const load = useCallback(
    async (quiet = false) => {
      listAbort.current?.abort();
      const ac = new AbortController();
      listAbort.current = ac;
      if (!quiet) setLoading(true);
      setError(null);
      try {
        if (route.kind === 'shares') {
          setSharesVersion((v) => v + 1);
        } else if (route.kind === 'trash') {
          const r = await api.trash();
          setTrash(r.items);
          setRetention(r.retentionDays);
        } else {
          const r = await api.list(route.path, ac.signal);
          setListing(r);
        }
      } catch (e) {
        if ((e as Error).name === 'AbortError') return;
        if (e instanceof ApiError && e.status === 404 && route.kind === 'dir' && route.path !== '/') {
          toast(`“${baseName(route.path)}”不存在，已返回上一级`, 'error');
          history.replaceState(history.state, '', hashFor({ kind: 'dir', path: parentOf(route.path) }));
          setRoute({ kind: 'dir', path: parentOf(route.path) });
          return;
        }
        setError((e as Error).message);
      } finally {
        if (listAbort.current === ac) setLoading(false);
      }
    },
    [route, toast],
  );

  useEffect(() => {
    setSelection(EMPTY_SEL);
    setRenaming(null);
    load();
  }, [load]);
  useEffect(refreshStatus, [refreshStatus]);

  const refreshAll = useCallback(
    (quiet = true) => {
      load(quiet);
      setTreeVersion((v) => v + 1);
      refreshStatus();
    },
    [load, refreshStatus],
  );

  // uploads finishing in the visible folder refresh it (debounced)
  const reloadTimer = useRef<number | null>(null);
  useEffect(() => {
    uploader.onFileDone = (dir) => {
      if (reloadTimer.current) clearTimeout(reloadTimer.current);
      reloadTimer.current = window.setTimeout(() => {
        const r = parseHash();
        if (r.kind === 'dir' && (r.path === dir || r.path.startsWith(dir === '/' ? '/' : `${dir}/`))) load(true);
        setTreeVersion((v) => v + 1);
        refreshStatus();
      }, 500);
    };
    return () => {
      uploader.onFileDone = null;
    };
  }, [load, refreshStatus]);

  // warn before closing the tab while uploading
  useEffect(() => {
    const onUnload = (e: BeforeUnloadEvent) => {
      if (uploader.busy) e.preventDefault();
    };
    window.addEventListener('beforeunload', onUnload);
    return () => window.removeEventListener('beforeunload', onUnload);
  }, []);

  // ---------- search ----------
  useEffect(() => {
    if (!search?.q || !currentDir) return;
    const ac = new AbortController();
    api
      .search(currentDir, search.q, ac.signal)
      .then((r) => setSearch((s) => (s && s.q === search.q ? { ...s, entries: r.entries, truncated: r.truncated } : s)))
      .catch((e) => e.name !== 'AbortError' && fail(e));
    return () => ac.abort();
  }, [search?.q, currentDir, fail]);
  useEffect(() => {
    const q = searchText.trim();
    const t = setTimeout(() => {
      if (!q) setSearch(null);
      else if (q !== search?.q) {
        setSelection(EMPTY_SEL);
        setSearch({ q, entries: null });
      }
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchText]);

  // ---------- items ----------
  const items: ViewItem[] = useMemo(() => {
    if (route.kind === 'trash') {
      const list = (trash ?? []).map((t) => ({
        key: t.id,
        path: t.original,
        entry: { name: t.name, type: t.type, size: t.size, mtime: t.deletedAt, ctime: t.mtime } as Entry,
      }));
      return list.sort((a, b) => b.entry.mtime - a.entry.mtime);
    }
    if (search) {
      const sorted = sortEntries(search.entries ?? [], prefs.sort);
      return sorted.map((e) => {
        const path = joinPath(e.parent ?? '/', e.name);
        return { key: path, path, entry: e };
      });
    }
    if (route.kind !== 'dir' || !listing || listing.path !== route.path) return [];
    return sortEntries(listing.entries, prefs.sort).map((e) => {
      const path = joinPath(listing.path, e.name);
      return { key: path, path, entry: e };
    });
  }, [route, trash, search, listing, prefs.sort]);

  const itemMap = useMemo(() => new Map(items.map((i) => [i.key, i])), [items]);
  const selectedItems = useMemo(() => items.filter((i) => selection.keys.has(i.key)), [items, selection.keys]);
  const selectedPaths = selectedItems.map((i) => i.path);
  const cutKeys = useMemo(() => new Set(clipboard?.mode === 'cut' ? clipboard.paths : []), [clipboard]);

  // drop selection entries that vanished after a reload
  useEffect(() => {
    setSelection((s) => {
      const keys = new Set([...s.keys].filter((k) => itemMap.has(k)));
      if (keys.size === s.keys.size && (!s.focus || itemMap.has(s.focus))) return s;
      return { keys, focus: s.focus && itemMap.has(s.focus) ? s.focus : null, anchor: s.anchor && itemMap.has(s.anchor) ? s.anchor : null };
    });
  }, [itemMap]);

  // ---------- columns ----------
  const columns: Column[] = useMemo(() => {
    const w = prefs.cols;
    if (route.kind === 'trash') {
      return [
        { id: 'name', label: '名称', width: w.name, min: 160, render: () => null },
        { id: 'original', label: '原位置', width: w.original, render: (i) => <span className="muted ellipsis">{parentOf(i.path)}</span> },
        { id: 'deleted', label: '删除日期', width: w.deleted, render: (i) => <span className="muted">{fmtDate(i.entry.mtime)}</span> },
        { id: 'size', label: '大小', width: w.size, align: 'right', render: (i) => <span className="muted">{fmtBytes(i.entry.size)}</span> },
      ];
    }
    const cols: Column[] = [{ id: 'name', label: '名称', width: w.name, min: 160, sortKey: 'name', render: () => null }];
    if (search)
      cols.push({
        id: 'location',
        label: '所在位置',
        width: w.location,
        render: (i) => <span className="muted ellipsis">{parentOf(i.path)}</span>,
      });
    cols.push(
      { id: 'mtime', label: '修改日期', width: w.mtime, sortKey: 'mtime', render: (i) => <span className="muted">{fmtDate(i.entry.mtime)}</span> },
      { id: 'type', label: '类型', width: w.type, sortKey: 'type', render: (i) => <span className="muted ellipsis">{typeLabel(i.entry)}</span> },
      {
        id: 'size',
        label: '大小',
        width: w.size,
        align: 'right',
        sortKey: 'size',
        render: (i) => <span className="muted">{i.entry.type === 'dir' ? `${i.entry.items ?? 0} 项` : fmtKB(i.entry.size)}</span>,
      },
    );
    return cols;
  }, [prefs.cols, route.kind, search]);

  const onSort = useCallback((key: SortKey) => setPrefs((p) => ({ ...p, sort: { key, dir: p.sort.key === key ? (p.sort.dir === 1 ? -1 : 1) : key === 'mtime' || key === 'size' ? -1 : 1 } })), []);
  const onColumnResize = useCallback((id: string, width: number) => setPrefs((p) => ({ ...p, cols: { ...p.cols, [id]: width } })), []);

  // ---------- actions ----------
  const withConflict = useCallback(
    async <T,>(action: string, run: (mode: ConflictMode) => Promise<T>): Promise<T | null> => {
      try {
        return await run('fail');
      } catch (e) {
        if (e instanceof ApiError && e.status === 409 && e.conflicts.length) {
          const mode = await dialogs.conflict(e.conflicts, action);
          if (!mode) return null;
          return run(mode);
        }
        throw e;
      }
    },
    [dialogs],
  );

  const openItem = useCallback(
    (item: ViewItem) => {
      if (route.kind === 'trash') return;
      if (item.entry.type === 'dir') goDir(item.path);
      else setPreview(item.key);
    },
    [route.kind, goDir],
  );

  const download = useCallback(
    async (targets: ViewItem[]) => {
      if (!targets.length) return;
      if (targets.length === 1 && targets[0].entry.type === 'file') {
        const a = document.createElement('a');
        a.href = fileUrl(targets[0].path, true);
        a.download = targets[0].entry.name;
        document.body.appendChild(a);
        a.click();
        a.remove();
        return;
      }
      try {
        const name = targets.length === 1 ? targets[0].entry.name : currentDir && currentDir !== '/' ? `${baseName(currentDir)}（${targets.length} 项）` : `网盘下载（${targets.length} 项）`;
        const r = await api.zip(
          targets.map((t) => t.path),
          name,
        );
        toast(`正在打包 ${r.count} 个项目（${fmtBytes(r.total)}），下载即将开始`, 'info');
        const a = document.createElement('a');
        a.href = r.url;
        document.body.appendChild(a);
        a.click();
        a.remove();
      } catch (e) {
        fail(e);
      }
    },
    [currentDir, toast, fail],
  );

  const newFolder = useCallback(
    async (dir = currentDir) => {
      if (!dir) return;
      try {
        const names = new Set((dir === currentDir ? (listing?.entries ?? []) : (await api.list(dir)).entries).map((e) => e.name.toLowerCase()));
        let name = '新建文件夹';
        for (let i = 2; names.has(name.toLowerCase()); i++) name = `新建文件夹 (${i})`;
        await api.mkdir(dir, name);
        setTreeVersion((v) => v + 1);
        if (dir === currentDir) {
          setSearch(null);
          await load(true);
          const key = joinPath(dir, name);
          setSelection({ keys: new Set([key]), focus: key, anchor: key });
          setRenaming(key);
        } else toast(`已在 ${dir} 中新建“${name}”`, 'ok');
      } catch (e) {
        fail(e);
      }
    },
    [currentDir, listing, load, toast, fail],
  );

  const onRenameEnd = useCallback(
    async (item: ViewItem, name: string | null) => {
      setRenaming(null);
      viewRef.current?.focus();
      if (!name || name === item.entry.name) return;
      try {
        await api.rename(item.path, name);
        const key = joinPath(parentOf(item.path), name);
        await load(true);
        setTreeVersion((v) => v + 1);
        setSelection({ keys: new Set([key]), focus: key, anchor: key });
      } catch (e) {
        fail(e);
      }
    },
    [load, fail],
  );

  const startRename = useCallback(
    async (item: ViewItem) => {
      if (search || narrow) {
        const name = await dialogs.prompt({ title: '重命名', label: '新名称', value: item.entry.name, confirmText: '重命名', selectStem: item.entry.type === 'file' });
        if (name) onRenameEnd(item, name);
        return;
      }
      setRenaming(item.key);
    },
    [search, narrow, dialogs, onRenameEnd],
  );

  const remove = useCallback(
    async (targets: ViewItem[], permanent = false) => {
      if (!targets.length) return;
      const label = targets.length === 1 ? `“${targets[0].entry.name}”` : `这 ${targets.length} 个项目`;
      if (permanent) {
        const ok = await dialogs.confirm({
          title: '永久删除',
          message: <>确定要永久删除{label}吗？此操作无法撤销。</>,
          confirmText: '永久删除',
          danger: true,
        });
        if (!ok) return;
      }
      try {
        const r = await api.remove(
          targets.map((t) => t.path),
          permanent,
        );
        refreshAll();
        if (permanent) toast(`已永久删除${label}`, 'ok');
        else
          toast(`已将${label}移至回收站`, 'ok', {
            label: '撤销',
            run: () =>
              api
                .trashRestore(r.trashIds)
                .then(() => {
                  refreshAll();
                  toast('已还原', 'ok');
                })
                .catch(fail),
          });
      } catch (e) {
        fail(e);
      }
    },
    [dialogs, refreshAll, toast, fail],
  );

  const transfer = useCallback(
    async (mode: 'move' | 'copy', paths: string[], dest: string) => {
      const inPlace = mode === 'move' && paths.every((p) => parentOf(p) === dest);
      if (!paths.length || inPlace) return false;
      try {
        const r = await withConflict<{ moved?: string[]; copied?: string[] }>(mode === 'move' ? '移动' : '复制', (c) => (mode === 'move' ? api.move(paths, dest, c) : api.copy(paths, dest, c)));
        if (!r) return false;
        const n = (r.moved ?? r.copied ?? []).length;
        toast(`已${mode === 'move' ? '移动' : '复制'} ${n} 个项目到 ${dest === '/' ? '我的网盘' : baseName(dest)}`, 'ok');
        refreshAll();
        return true;
      } catch (e) {
        fail(e);
        return false;
      }
    },
    [withConflict, toast, refreshAll, fail],
  );

  const paste = useCallback(
    async (dest = currentDir) => {
      if (!clipboard || !dest) return;
      const ok = await transfer(clipboard.mode === 'cut' ? 'move' : 'copy', clipboard.paths, dest);
      if (ok && clipboard.mode === 'cut') setClipboard(null);
    },
    [clipboard, currentDir, transfer],
  );

  const moveOrCopyTo = useCallback(
    async (mode: 'move' | 'copy', targets: ViewItem[]) => {
      if (!targets.length) return;
      const dest = await dialogs.pickFolder({
        title: mode === 'move' ? `将 ${targets.length} 个项目移动到` : `将 ${targets.length} 个项目复制到`,
        confirmText: mode === 'move' ? '移动到此处' : '复制到此处',
        start: currentDir ?? '/',
        exclude: targets.filter((t) => t.entry.type === 'dir').map((t) => t.path),
      });
      if (dest) transfer(mode, targets.map((t) => t.path), dest);
    },
    [dialogs, currentDir, transfer],
  );

  const startUpload = useCallback(
    async (sources: UploadSource[], dest: string, emptyDirs: string[] = []) => {
      if (!sources.length && !emptyDirs.length) return;
      try {
        const existing = dest === currentDir && listing?.path === dest ? listing.entries : (await api.list(dest)).entries;
        const names = new Map(existing.map((e) => [e.name.toLowerCase(), e]));
        const tops = new Set(sources.map((s) => s.relPath.split('/')[0]));
        // a dropped folder merging into an existing folder is not a conflict by itself
        const conflicts = [...tops].filter((t) => {
          const hit = names.get(t.toLowerCase());
          if (!hit) return false;
          const isFolderUpload = sources.some((s) => s.relPath.startsWith(`${t}/`));
          return !(isFolderUpload && hit.type === 'dir');
        });
        let mode: ConflictMode = 'rename';
        if (conflicts.length) {
          const m = await dialogs.conflict(conflicts, '上传');
          if (!m) return;
          mode = m;
        } else if (sources.some((s) => s.relPath.includes('/') && names.has(s.relPath.split('/')[0].toLowerCase()))) {
          mode = 'rename';
        }
        for (const d of emptyDirs) {
          let at = dest;
          for (const seg of segmentsOf(d)) {
            await api.mkdir(at, seg).catch((e) => {
              if (!(e instanceof ApiError && e.code === 'EXISTS')) throw e;
            });
            at = joinPath(at, seg);
          }
        }
        if (emptyDirs.length && !sources.length) refreshAll();
        const total = sources.reduce((s, x) => s + x.file.size, 0);
        if (storage && total > storage.available) {
          toast(`空间不足：需要 ${fmtBytes(total)}，可用 ${fmtBytes(storage.available)}`, 'error');
          return;
        }
        uploader.add(sources, dest, mode);
      } catch (e) {
        fail(e);
      }
    },
    [currentDir, listing, dialogs, storage, toast, refreshAll, fail],
  );

  const pickUpload = (kind: 'file' | 'folder', dest = currentDir) => {
    if (!dest) return;
    uploadDest.current = dest;
    (kind === 'file' ? fileInput : folderInput).current?.click();
  };

  const copyText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast('已复制到剪贴板', 'ok');
    } catch {
      toast('无法访问剪贴板', 'error');
    }
  };

  // ---------- trash actions ----------
  const restore = useCallback(
    async (ids: string[]) => {
      if (!ids.length) return;
      try {
        const r = await api.trashRestore(ids);
        toast(`已还原 ${r.restored.length} 个项目`, 'ok');
        refreshAll();
      } catch (e) {
        fail(e);
      }
    },
    [toast, refreshAll, fail],
  );
  const purge = useCallback(
    async (ids: string[]) => {
      if (!ids.length) return;
      const ok = await dialogs.confirm({ title: '永久删除', message: `确定要永久删除这 ${ids.length} 个项目吗？此操作无法撤销。`, confirmText: '永久删除', danger: true });
      if (!ok) return;
      try {
        await api.trashDelete(ids);
        refreshAll();
      } catch (e) {
        fail(e);
      }
    },
    [dialogs, refreshAll, fail],
  );
  const emptyTrash = useCallback(async () => {
    const ok = await dialogs.confirm({ title: '清空回收站', message: '回收站中的所有项目都将被永久删除，此操作无法撤销。', confirmText: '清空', danger: true });
    if (!ok) return;
    try {
      await api.trashEmpty();
      refreshAll();
      toast('回收站已清空', 'ok');
    } catch (e) {
      fail(e);
    }
  }, [dialogs, refreshAll, toast, fail]);

  const selectAll = () => setSelection({ keys: new Set(items.map((i) => i.key)), focus: items[0]?.key ?? null, anchor: items[0]?.key ?? null });
  const invertSelection = () => setSelection((s) => ({ keys: new Set(items.filter((i) => !s.keys.has(i.key)).map((i) => i.key)), focus: null, anchor: null }));

  const zoom = useCallback((d: 1 | -1) => {
    setPrefs((p) => {
      const i = ZOOM_ORDER.indexOf(p.view);
      const next = ZOOM_ORDER[Math.max(0, Math.min(ZOOM_ORDER.length - 1, (i < 0 ? 3 : i) + d))];
      return { ...p, view: next };
    });
  }, []);

  // ---------- menus ----------
  const viewSubmenu = (): MenuItem[] => [
    ...(['xl', 'lg', 'md', 'sm', 'list', 'details', 'tiles', 'content'] as ViewMode[]).map((v) => ({
      label: VIEW_LABELS[v],
      checked: prefs.view === v,
      radio: true,
      onClick: () => setPref('view', v),
    })),
    'sep',
    { label: '项目复选框', checked: prefs.checkboxes, onClick: () => setPref('checkboxes', !prefs.checkboxes) },
    { label: '图片缩略图', checked: prefs.thumbnails, onClick: () => setPref('thumbnails', !prefs.thumbnails) },
    { label: '详细信息窗格', checked: prefs.pane, shortcut: 'Alt+P', onClick: () => setPref('pane', !prefs.pane) },
  ];
  const sortSubmenu = (): MenuItem[] => [
    ...(['name', 'mtime', 'type', 'size', 'ctime'] as SortKey[]).map((k) => ({
      label: SORT_LABELS[k],
      checked: prefs.sort.key === k,
      radio: true,
      onClick: () => setPref('sort', { ...prefs.sort, key: k }),
    })),
    'sep',
    { label: '递增', checked: prefs.sort.dir === 1, radio: true, onClick: () => setPref('sort', { ...prefs.sort, dir: 1 }) },
    { label: '递减', checked: prefs.sort.dir === -1, radio: true, onClick: () => setPref('sort', { ...prefs.sort, dir: -1 }) },
  ];

  const shareItems = (targets: ViewItem[]) => {
    if (!targets.length) return;
    dialogs.share({
      paths: targets.map((t) => t.path),
      names: targets.map((t) => t.entry.name),
      types: targets.map((t) => t.entry.type),
      onManage: () => navigate({ kind: 'shares' }),
    });
  };

  const itemMenu = (targets: ViewItem[]): MenuItem[] => {
    if (route.kind === 'trash') {
      return [
        { label: '还原', icon: <ArchiveRestore size={16} />, onClick: () => restore(targets.map((t) => t.key)) },
        'sep',
        { label: '永久删除', icon: <Trash2 size={16} />, danger: true, onClick: () => purge(targets.map((t) => t.key)) },
      ];
    }
    const single = targets.length === 1 ? targets[0] : null;
    const allFiles = targets.every((t) => t.entry.type === 'file');
    return [
      {
        label: single?.entry.type === 'dir' ? '打开' : '预览',
        icon: single?.entry.type === 'dir' ? <FolderOpen size={16} /> : <Eye size={16} />,
        shortcut: 'Enter',
        hidden: !single,
        onClick: () => single && openItem(single),
      },
      { label: '打开所在位置', icon: <FolderInput size={16} />, hidden: !search || !single, onClick: () => single && goDir(parentOf(single.path)) },
      {
        label: single && allFiles ? '下载' : '打包下载 (.zip)',
        icon: <Download size={16} />,
        onClick: () => download(targets),
      },
      { label: '生成下载链接…', icon: <Link2 size={16} />, onClick: () => shareItems(targets) },
      'sep',
      { label: '剪切', icon: <Scissors size={16} />, shortcut: 'Ctrl+X', onClick: () => setClipboard({ mode: 'cut', paths: targets.map((t) => t.path) }) },
      { label: '复制', icon: <Copy size={16} />, shortcut: 'Ctrl+C', onClick: () => setClipboard({ mode: 'copy', paths: targets.map((t) => t.path) }) },
      {
        label: '粘贴到此文件夹',
        icon: <ClipboardPaste size={16} />,
        hidden: !(single?.entry.type === 'dir' && clipboard),
        onClick: () => single && paste(single.path),
      },
      'sep',
      { label: '重命名', icon: <Pencil size={16} />, shortcut: 'F2', hidden: !single, onClick: () => single && startRename(single) },
      { label: '移动到…', icon: <FolderInput size={16} />, onClick: () => moveOrCopyTo('move', targets) },
      { label: '复制到…', icon: <CopyPlus size={16} />, onClick: () => moveOrCopyTo('copy', targets) },
      {
        label: '上传到此文件夹',
        icon: <Upload size={16} />,
        hidden: single?.entry.type !== 'dir',
        submenu: [
          { label: '上传文件…', icon: <FileUp size={16} />, onClick: () => single && pickUpload('file', single.path) },
          { label: '上传文件夹…', icon: <FolderUp size={16} />, onClick: () => single && pickUpload('folder', single.path) },
        ],
      },
      'sep',
      { label: '删除', icon: <Trash2 size={16} />, shortcut: 'Delete', danger: true, onClick: () => remove(targets) },
      { label: '永久删除', icon: <X size={16} />, shortcut: 'Shift+Del', danger: true, onClick: () => remove(targets, true) },
      'sep',
      { label: '复制路径', icon: <Link2 size={16} />, hidden: !single, onClick: () => single && copyText(single.path) },
      { label: '属性', icon: <Info size={16} />, shortcut: 'Alt+Enter', onClick: () => dialogs.props(targets.map((t) => t.path)) },
    ];
  };

  const blankMenu = (): MenuItem[] => {
    if (route.kind === 'trash') {
      return [
        { label: '刷新', icon: <RefreshCw size={16} />, shortcut: 'F5', onClick: () => refreshAll(false) },
        'sep',
        { label: '全部还原', icon: <ArchiveRestore size={16} />, disabled: !items.length, onClick: () => restore(items.map((i) => i.key)) },
        { label: '清空回收站', icon: <Trash2 size={16} />, danger: true, disabled: !items.length, onClick: emptyTrash },
      ];
    }
    return [
      { label: '查看', icon: <LayoutGrid size={16} />, submenu: viewSubmenu() },
      { label: '排序方式', icon: <ArrowDownUp size={16} />, submenu: sortSubmenu() },
      { label: '刷新', icon: <RefreshCw size={16} />, shortcut: 'F5', onClick: () => refreshAll(false) },
      'sep',
      { label: '粘贴', icon: <ClipboardPaste size={16} />, shortcut: 'Ctrl+V', disabled: !clipboard || !!search, onClick: () => paste() },
      'sep',
      { label: '新建文件夹', icon: <FolderPlus size={16} />, shortcut: 'Ctrl+Shift+N', disabled: !!search, onClick: () => newFolder() },
      { label: '上传文件…', icon: <FileUp size={16} />, shortcut: 'Ctrl+U', disabled: !!search, onClick: () => pickUpload('file') },
      { label: '上传文件夹…', icon: <FolderUp size={16} />, disabled: !!search, onClick: () => pickUpload('folder') },
      'sep',
      { label: '全选', icon: <CheckSquare size={16} />, shortcut: 'Ctrl+A', disabled: !items.length, onClick: selectAll },
      { label: '反向选择', icon: <Rows3 size={16} />, disabled: !items.length, onClick: invertSelection },
      { label: '属性', icon: <Info size={16} />, onClick: () => currentDir && dialogs.props([currentDir]) },
    ];
  };

  const onContextMenu = useCallback(
    (e: React.MouseEvent, item: ViewItem | null) => {
      if (item) {
        const targets = selection.keys.has(item.key) ? selectedItems : [item];
        setMenu({ x: e.clientX, y: e.clientY, items: itemMenu(targets) });
      } else setMenu({ x: e.clientX, y: e.clientY, items: blankMenu() });
    },
    // menus read the latest state on each open
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selection, selectedItems, route, clipboard, prefs, search, items],
  );

  const openMenuAt = (el: HTMLElement, list: MenuItem[]) => {
    const r = el.getBoundingClientRect();
    setMenu({ x: r.left, y: r.bottom + 4, items: list });
  };

  const treeMenu = (e: React.MouseEvent, path: string) => {
    const item: ViewItem = { key: path, path, entry: { name: baseName(path) || '我的网盘', type: 'dir', size: 0, mtime: 0, ctime: 0 } };
    setMenu({
      x: e.clientX,
      y: e.clientY,
      items: [
        { label: '打开', icon: <FolderOpen size={16} />, onClick: () => goDir(path) },
        { label: '新建文件夹', icon: <FolderPlus size={16} />, onClick: () => newFolder(path) },
        { label: '上传文件…', icon: <FileUp size={16} />, onClick: () => pickUpload('file', path) },
        { label: '粘贴', icon: <ClipboardPaste size={16} />, disabled: !clipboard, onClick: () => paste(path) },
        'sep',
        { label: '打包下载 (.zip)', icon: <Download size={16} />, hidden: path === '/', onClick: () => download([item]) },
        { label: '生成下载链接…', icon: <Link2 size={16} />, hidden: path === '/', onClick: () => shareItems([item]) },
        { label: '属性', icon: <Info size={16} />, onClick: () => dialogs.props([path]) },
      ],
    });
  };

  // ---------- keyboard ----------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (dialogs.open || preview || menu || renaming) return;
      const t = e.target as HTMLElement;
      const inField = !!t.closest('input, textarea, select, [contenteditable="true"]');
      const ctrl = e.ctrlKey || e.metaKey;
      const k = e.key;
      const lower = k.toLowerCase();
      // shortcuts that work everywhere
      if (ctrl && lower === 'f') {
        e.preventDefault();
        searchInput.current?.focus();
        searchInput.current?.select();
        return;
      }
      if (k === 'F5' || (ctrl && lower === 'r')) {
        e.preventDefault();
        refreshAll(false);
        return;
      }
      if (e.altKey && (k === 'ArrowLeft' || k === 'ArrowRight')) {
        e.preventDefault();
        if (k === 'ArrowLeft') history.back();
        else history.forward();
        return;
      }
      if (inField) return;
      if (e.altKey && k === 'ArrowUp') {
        e.preventDefault();
        if (currentDir && currentDir !== '/') goDir(parentOf(currentDir));
        return;
      }
      if (e.altKey && lower === 'p') {
        e.preventDefault();
        setPref('pane', !prefs.pane);
        return;
      }
      if (route.kind === 'shares') return;
      if (route.kind === 'trash') {
        if (k === 'Delete' && selectedItems.length) purge(selectedItems.map((i) => i.key));
        else if (ctrl && lower === 'a') {
          e.preventDefault();
          selectAll();
        } else if (k === 'Escape') setSelection(EMPTY_SEL);
        return;
      }
      if (ctrl && e.shiftKey && lower === 'n') {
        e.preventDefault();
        if (!search) newFolder();
      } else if (ctrl && lower === 'u') {
        e.preventDefault();
        if (!search) pickUpload('file');
      } else if (ctrl && lower === 'a') {
        e.preventDefault();
        selectAll();
      } else if (ctrl && lower === 'c' && selectedItems.length) {
        setClipboard({ mode: 'copy', paths: selectedPaths });
        toast(`已复制 ${selectedItems.length} 个项目，可在目标文件夹中粘贴`, 'info');
      } else if (ctrl && lower === 'x' && selectedItems.length) {
        setClipboard({ mode: 'cut', paths: selectedPaths });
        toast(`已剪切 ${selectedItems.length} 个项目，可在目标文件夹中粘贴`, 'info');
      } else if (ctrl && lower === 'v') {
        if (!search) paste();
      } else if (k === 'Delete' && selectedItems.length) {
        e.preventDefault();
        remove(selectedItems, e.shiftKey);
      } else if (k === 'F2' && selectedItems.length === 1) {
        e.preventDefault();
        startRename(selectedItems[0]);
      } else if (k === 'Enter' && e.altKey && selectedItems.length) {
        e.preventDefault();
        dialogs.props(selectedPaths);
      } else if (k === 'Enter') {
        const focus = selection.focus ? itemMap.get(selection.focus) : selectedItems[0];
        if (focus) {
          e.preventDefault();
          if (selectedItems.length > 1 && selectedItems.every((i) => i.entry.type === 'file')) setPreview(focus.key);
          else openItem(focus);
        }
      } else if (k === ' ' && !ctrl) {
        const focus = selection.focus ? itemMap.get(selection.focus) : null;
        if (focus?.entry.type === 'file') {
          e.preventDefault();
          setPreview(focus.key);
        }
      } else if (k === 'Backspace') {
        e.preventDefault();
        if (search) setSearchText('');
        else if (currentDir && currentDir !== '/') goDir(parentOf(currentDir));
      } else if (k === 'Escape') {
        if (clipboard?.mode === 'cut' && !selection.keys.size) setClipboard(null);
        else if (search && !selection.keys.size) setSearchText('');
        setSelection(EMPTY_SEL);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // keep dropped files from navigating the browser away
  useEffect(() => {
    const stop = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes('Files')) e.preventDefault();
    };
    window.addEventListener('dragover', stop);
    window.addEventListener('drop', stop);
    return () => {
      window.removeEventListener('dragover', stop);
      window.removeEventListener('drop', stop);
    };
  }, []);

  // ---------- drag & drop ----------
  const isExternal = (e: React.DragEvent) => e.dataTransfer.types.includes('Files') && !dragging.current;
  const canDropInto = (path: string, e: React.DragEvent) => {
    if (route.kind !== 'dir') return false;
    if (isExternal(e)) return true;
    const src = dragging.current;
    if (!src) return false;
    return !src.some((p) => path === p || path.startsWith(`${p}/`)) && !src.every((p) => parentOf(p) === path);
  };
  const canDropOn = (item: ViewItem | null, e: React.DragEvent) => {
    if (item) return canDropInto(item.path, e);
    if (search || !currentDir) return false;
    return isExternal(e);
  };
  const dropInto = async (dest: string, e: React.DragEvent) => {
    if (isExternal(e)) {
      const { files, emptyDirs } = await sourcesFromDataTransfer(e.dataTransfer);
      startUpload(files, dest, emptyDirs);
      return;
    }
    const src = dragging.current;
    dragging.current = null;
    if (src) transfer(e.ctrlKey || e.altKey ? 'copy' : 'move', src, dest);
  };
  const onDrop = (item: ViewItem | null, e: React.DragEvent) => {
    const dest = item ? item.path : currentDir;
    if (dest) dropInto(dest, e);
  };
  const onDragStart = (e: React.DragEvent, item: ViewItem) => {
    if (route.kind === 'trash') return e.preventDefault();
    let group = selectedItems;
    if (!selection.keys.has(item.key)) {
      group = [item];
      setSelection({ keys: new Set([item.key]), focus: item.key, anchor: item.key });
    }
    const paths = group.map((g) => g.path);
    dragging.current = paths;
    e.dataTransfer.effectAllowed = 'copyMove';
    e.dataTransfer.setData(DRAG_TYPE, JSON.stringify(paths));
    e.dataTransfer.setData('text/plain', paths.join('\n'));
    if (group.length === 1 && item.entry.type === 'file') {
      // Chrome/Edge: drag a file straight onto the desktop to download it
      e.dataTransfer.setData('DownloadURL', `application/octet-stream:${item.entry.name}:${location.origin}${fileUrl(item.path, true)}`);
    }
    const ghost = document.createElement('div');
    ghost.className = 'drag-ghost';
    ghost.textContent = group.length > 1 ? `${group.length} 个项目` : item.entry.name;
    document.body.appendChild(ghost);
    e.dataTransfer.setDragImage(ghost, -12, -8);
    setTimeout(() => ghost.remove(), 0);
    const end = () => {
      dragging.current = null;
      window.removeEventListener('dragend', end);
    };
    window.addEventListener('dragend', end);
  };

  // stable identities so the memoized Sidebar skips re-rendering on selection changes
  const sidebarShares = useStable(() => navigate({ kind: 'shares' }));
  const sidebarTrash = useStable(() => navigate({ kind: 'trash' }));
  const sidebarNavigate = useStable((p: string) => goDir(p));
  const sidebarCanDrop = useStable((p: string, e: React.DragEvent) => canDropInto(p, e));
  const sidebarDrop = useStable((p: string, e: React.DragEvent) => dropInto(p, e));
  const sidebarMenu = useStable((e: React.MouseEvent, p: string) => treeMenu(e, p));
  const openDirStable = useStable((p: string) => goDir(p));

  // ---------- derived UI ----------
  const segs = currentDir ? segmentsOf(currentDir) : [];
  const title = route.kind === 'trash' ? '回收站' : route.kind === 'shares' ? '分享链接' : segs.length ? segs[segs.length - 1] : '我的网盘';
  useEffect(() => {
    document.title = `${title} - 出发网盘`;
  }, [title]);

  const selectedSize = selectedItems.reduce((s, i) => s + (i.entry.type === 'file' ? i.entry.size : 0), 0);
  const hasSel = selectedItems.length > 0;
  const single = selectedItems.length === 1 ? selectedItems[0] : null;
  const previewItems = useMemo(() => items.filter((i) => i.entry.type === 'file'), [items]);
  const showPane = prefs.pane && !narrow && route.kind === 'dir';

  const empty =
    loading && !items.length ? (
      <div className="view-empty">
        <span className="spinner" /> 正在加载…
      </div>
    ) : error ? (
      <div className="view-empty error">
        <p>{error}</p>
        <button className="btn" onClick={() => load()}>
          <RefreshCw size={16} /> 重试
        </button>
      </div>
    ) : route.kind === 'trash' ? (
      <div className="view-empty">
        <Trash2 size={40} strokeWidth={1.4} />
        <p>回收站是空的</p>
        <span className="muted small">删除的项目会在这里保留 {retention} 天</span>
      </div>
    ) : search ? (
      <div className="view-empty">
        {search.entries === null ? (
          <>
            <span className="spinner" /> 正在搜索…
          </>
        ) : (
          <>
            <Search size={40} strokeWidth={1.4} />
            <p>没有与“{search.q}”匹配的项目</p>
          </>
        )}
      </div>
    ) : (
      <div className="view-empty drop-hint">
        <Upload size={44} strokeWidth={1.3} />
        <p>此文件夹为空</p>
        <span className="muted small">将文件或文件夹拖到这里上传，或</span>
        <div className="row">
          <button className="btn primary" onClick={() => pickUpload('file')}>
            <FileUp size={16} /> 上传文件
          </button>
          <button className="btn" onClick={() => pickUpload('folder')}>
            <FolderUp size={16} /> 上传文件夹
          </button>
        </div>
      </div>
    );

  const themeIcon = prefs.theme === 'dark' ? <Moon size={16} /> : prefs.theme === 'light' ? <Sun size={16} /> : <SunMoon size={16} />;

  return (
    <div className={`app ${sidebarOpen ? 'sidebar-open' : ''}`}>
      <header className="topbar">
        <button className="icon-btn only-narrow" onClick={() => setSidebarOpen((v) => !v)} aria-label="导航菜单">
          <Menu size={20} />
        </button>
        <a className="brand" href="#/" onClick={(e) => (e.preventDefault(), goDir('/'))}>
          <Logo size={30} />
          <span>出发网盘</span>
        </a>
        <div className="nav-buttons">
          <button className="icon-btn" disabled={histIdx <= 0} onClick={() => history.back()} aria-label="后退" title="后退 (Alt+←)">
            <ArrowLeft size={18} />
          </button>
          <button className="icon-btn" disabled={histIdx >= histMax} onClick={() => history.forward()} aria-label="前进" title="前进 (Alt+→)">
            <ArrowRight size={18} />
          </button>
          <button
            className="icon-btn"
            disabled={!currentDir || currentDir === '/'}
            onClick={() => currentDir && goDir(parentOf(currentDir))}
            aria-label="上一级"
            title="上一级 (Alt+↑)"
          >
            <ArrowUp size={18} />
          </button>
          <button className="icon-btn" onClick={() => refreshAll(false)} aria-label="刷新" title="刷新 (F5)">
            <RefreshCw size={17} className={loading ? 'spin' : ''} />
          </button>
        </div>
        <div className="address" onClick={(e) => e.target === e.currentTarget && currentDir && setEditingPath(currentDir)}>
          {editingPath !== null ? (
            <input
              className="address-input"
              autoFocus
              value={editingPath}
              spellCheck={false}
              onFocus={(e) => e.currentTarget.select()}
              onChange={(e) => setEditingPath(e.target.value)}
              onBlur={() => setEditingPath(null)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  const p = '/' + segmentsOf(editingPath.replace(/\\/g, '/')).join('/');
                  setEditingPath(null);
                  goDir(p);
                } else if (e.key === 'Escape') setEditingPath(null);
              }}
            />
          ) : (
            <nav className="crumbs" aria-label="当前位置">
              {route.kind !== 'dir' ? (
                <span className="crumb current">
                  {route.kind === 'trash' ? <Trash2 size={15} /> : <Link2 size={15} />} {title}
                </span>
              ) : (
                <>
                  <button
                    className={`crumb ${segs.length === 0 ? 'current' : ''}`}
                    onClick={() => goDir('/')}
                    onDragOver={(e) => canDropInto('/', e) && (e.preventDefault(), e.currentTarget.classList.add('drop-target'))}
                    onDragLeave={(e) => e.currentTarget.classList.remove('drop-target')}
                    onDrop={(e) => {
                      e.currentTarget.classList.remove('drop-target');
                      if (canDropInto('/', e)) (e.preventDefault(), dropInto('/', e));
                    }}
                  >
                    <HardDrive size={15} /> 我的网盘
                  </button>
                  {segs.map((s, i) => {
                    const p = '/' + segs.slice(0, i + 1).join('/');
                    return (
                      <span key={p} className="crumb-part">
                        <ChevronRight size={14} className="crumb-sep" />
                        <button
                          className={`crumb ${i === segs.length - 1 ? 'current' : ''}`}
                          onClick={() => goDir(p)}
                          onDragOver={(e) => canDropInto(p, e) && (e.preventDefault(), e.currentTarget.classList.add('drop-target'))}
                          onDragLeave={(e) => e.currentTarget.classList.remove('drop-target')}
                          onDrop={(e) => {
                            e.currentTarget.classList.remove('drop-target');
                            if (canDropInto(p, e)) (e.preventDefault(), dropInto(p, e));
                          }}
                        >
                          {s}
                        </button>
                      </span>
                    );
                  })}
                </>
              )}
            </nav>
          )}
        </div>
        <label className={`searchbox ${route.kind !== 'dir' ? 'disabled' : ''}`}>
          <Search size={16} />
          <input
            ref={searchInput}
            type="search"
            placeholder={route.kind !== 'dir' ? `${title}中不可搜索` : `在 ${title} 中搜索`}
            disabled={route.kind !== 'dir'}
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setSearchText('');
                viewRef.current?.focus();
              } else if (e.key === 'ArrowDown' || e.key === 'Enter') {
                e.preventDefault();
                viewRef.current?.focus();
              }
            }}
          />
          {searchText && (
            <button className="icon-btn small ghost" onClick={() => setSearchText('')} aria-label="清除搜索">
              <X size={14} />
            </button>
          )}
        </label>
        <button
          className="user-btn"
          onClick={(e) =>
            openMenuAt(e.currentTarget, [
              { label: `已登录：${user}`, icon: <UserRound size={16} />, disabled: true },
              'sep',
              {
                label: '主题',
                icon: themeIcon,
                submenu: [
                  { label: '跟随系统', radio: true, checked: prefs.theme === 'system', onClick: () => setPref('theme', 'system') },
                  { label: '浅色', radio: true, checked: prefs.theme === 'light', onClick: () => setPref('theme', 'light') },
                  { label: '深色', radio: true, checked: prefs.theme === 'dark', onClick: () => setPref('theme', 'dark') },
                ],
              },
              { label: '键盘快捷键', icon: <Keyboard size={16} />, onClick: () => dialogs.shortcuts() },
              { label: unified ? '统一账户与密码' : '修改密码', icon: <KeyRound size={16} />, onClick: () => unified ? location.assign('/account/') : dialogs.password() },
              'sep',
              { label: '退出登录', icon: <LogOut size={16} />, danger: true, onClick: onLogout },
            ])
          }
          aria-label="账户菜单"
        >
          <span className="avatar">{user.slice(0, 1).toUpperCase()}</span>
        </button>
      </header>

      <div className="commandbar" role="toolbar" aria-label="命令">
        {route.kind === 'dir' ? (
          <>
            <button className="cmd primary" disabled={!!search} onClick={(e) => openMenuAt(e.currentTarget, [
              { label: '上传文件…', icon: <FileUp size={16} />, shortcut: 'Ctrl+U', onClick: () => pickUpload('file') },
              { label: '上传文件夹…', icon: <FolderUp size={16} />, onClick: () => pickUpload('folder') },
            ])}>
              <Upload size={17} />
              <span>上传</span>
            </button>
            <button className="cmd" disabled={!!search} onClick={() => newFolder()} title="新建文件夹 (Ctrl+Shift+N)">
              <FolderPlus size={17} />
              <span>新建文件夹</span>
            </button>
            <span className="cmd-sep" />
            <button className="cmd icon" disabled={!hasSel} onClick={() => setClipboard({ mode: 'cut', paths: selectedPaths })} title="剪切 (Ctrl+X)" aria-label="剪切">
              <Scissors size={17} />
            </button>
            <button className="cmd icon" disabled={!hasSel} onClick={() => setClipboard({ mode: 'copy', paths: selectedPaths })} title="复制 (Ctrl+C)" aria-label="复制">
              <Copy size={17} />
            </button>
            <button className="cmd icon" disabled={!clipboard || !!search} onClick={() => paste()} title="粘贴 (Ctrl+V)" aria-label="粘贴">
              <ClipboardPaste size={17} />
            </button>
            <button className="cmd icon" disabled={!single} onClick={() => single && startRename(single)} title="重命名 (F2)" aria-label="重命名">
              <Pencil size={17} />
            </button>
            <button className="cmd icon danger" disabled={!hasSel} onClick={() => remove(selectedItems)} title="删除 (Delete)" aria-label="删除">
              <Trash2 size={17} />
            </button>
            <span className="cmd-sep" />
            <button className="cmd" disabled={!hasSel} onClick={() => download(selectedItems)} title="下载">
              <Download size={17} />
              <span>{selectedItems.length > 1 || single?.entry.type === 'dir' ? '打包下载' : '下载'}</span>
            </button>
            <button className="cmd" disabled={!hasSel} onClick={() => shareItems(selectedItems)} title="生成下载链接">
              <Link2 size={17} />
              <span>分享</span>
            </button>
            <span className="cmd-sep" />
            <button className="cmd" onClick={(e) => openMenuAt(e.currentTarget, sortSubmenu())}>
              <ArrowDownUp size={17} />
              <span>排序</span>
            </button>
            <button className="cmd" onClick={(e) => openMenuAt(e.currentTarget, viewSubmenu())}>
              <LayoutGrid size={17} />
              <span>查看</span>
            </button>
            <button
              className="cmd icon"
              onClick={(e) =>
                openMenuAt(e.currentTarget, [
                  { label: '全选', icon: <CheckSquare size={16} />, shortcut: 'Ctrl+A', onClick: selectAll },
                  { label: '全部取消', icon: <X size={16} />, disabled: !hasSel, onClick: () => setSelection(EMPTY_SEL) },
                  { label: '反向选择', icon: <Rows3 size={16} />, onClick: invertSelection },
                  'sep',
                  { label: '移动到…', icon: <FolderInput size={16} />, disabled: !hasSel, onClick: () => moveOrCopyTo('move', selectedItems) },
                  { label: '复制到…', icon: <CopyPlus size={16} />, disabled: !hasSel, onClick: () => moveOrCopyTo('copy', selectedItems) },
                  { label: '永久删除', icon: <X size={16} />, danger: true, disabled: !hasSel, onClick: () => remove(selectedItems, true) },
                  'sep',
                  { label: '属性', icon: <Info size={16} />, onClick: () => dialogs.props(hasSel ? selectedPaths : [currentDir ?? '/']) },
                ])
              }
              title="更多"
              aria-label="更多"
            >
              <MoreHorizontal size={18} />
            </button>
            <span className="cmd-spacer" />
            <button className={`cmd icon not-narrow ${prefs.pane ? 'on' : ''}`} onClick={() => setPref('pane', !prefs.pane)} title="详细信息窗格 (Alt+P)" aria-label="详细信息窗格" aria-pressed={prefs.pane}>
              <PanelRight size={17} />
            </button>
          </>
        ) : route.kind === 'trash' ? (
          <>
            <button className="cmd" disabled={!hasSel} onClick={() => restore(selectedItems.map((i) => i.key))}>
              <ArchiveRestore size={17} />
              <span>还原选定项目</span>
            </button>
            <button className="cmd" disabled={!items.length} onClick={() => restore(items.map((i) => i.key))}>
              <ArchiveRestore size={17} />
              <span>全部还原</span>
            </button>
            <span className="cmd-sep" />
            <button className="cmd danger" disabled={!hasSel} onClick={() => purge(selectedItems.map((i) => i.key))}>
              <X size={17} />
              <span>永久删除</span>
            </button>
            <button className="cmd danger" disabled={!items.length} onClick={emptyTrash}>
              <Trash2 size={17} />
              <span>清空回收站</span>
            </button>
            <span className="cmd-spacer" />
            <span className="muted small not-narrow">项目会在删除 {retention} 天后自动清除</span>
          </>
        ) : (
          <>
            <button className="cmd" onClick={() => refreshAll(false)}>
              <RefreshCw size={17} />
              <span>刷新</span>
            </button>
            <span className="cmd-spacer" />
            <span className="muted small not-narrow">在文件上点右键 →“生成下载链接”来创建新链接</span>
          </>
        )}
      </div>

      <div className="main">
        <div className="sidebar-scrim only-narrow" onClick={() => setSidebarOpen(false)} />
        <Sidebar
          current={currentDir}
          inTrash={route.kind === 'trash'}
          inShares={route.kind === 'shares'}
          onShares={sidebarShares}
          version={treeVersion}
          storage={storage}
          onNavigate={sidebarNavigate}
          onTrash={sidebarTrash}
          canDrop={sidebarCanDrop}
          onDrop={sidebarDrop}
          onContextMenu={sidebarMenu}
        />
        <section className="content" aria-label={title}>
          {route.kind === 'shares' ? (
            <SharesView version={sharesVersion} onOpenLocation={goDir} notify={toast} />
          ) : (
            <>
          {search && (
            <div className="search-banner">
              <Search size={15} />
              <span>
                在 <strong>{title}</strong> 及其子文件夹中搜索“{search.q}”
                {search.entries && `：找到 ${search.entries.length}${search.truncated ? '+' : ''} 个结果`}
              </span>
              <button className="btn small" onClick={() => setSearchText('')}>
                退出搜索
              </button>
            </div>
          )}
          <FileView
            items={items}
            mode={route.kind === 'trash' ? 'details' : prefs.view}
            columns={columns}
            sort={prefs.sort}
            onSort={onSort}
            onColumnResize={onColumnResize}
            selection={selection}
            onSelection={setSelection}
            cutKeys={cutKeys}
            onOpen={openItem}
            onContextMenu={onContextMenu}
            onKeyDown={() => {}}
            renaming={renaming}
            onRenameEnd={onRenameEnd}
            canDropOn={canDropOn}
            onDrop={onDrop}
            onDragStart={onDragStart}
            onZoom={zoom}
            thumbnails={prefs.thumbnails}
            checkboxes={prefs.checkboxes}
            empty={empty}
            viewRef={viewRef}
            subtitle={(i) =>
              route.kind === 'trash'
                ? `原位置 ${parentOf(i.path)}`
                : i.entry.type === 'dir'
                  ? `文件夹 · ${i.entry.items ?? 0} 个项目`
                  : `${typeLabel(i.entry)} · ${fmtBytes(i.entry.size)} · ${fmtDate(i.entry.mtime)}`
            }
          />
            </>
          )}
        </section>
        {showPane && (
          <DetailsPane
            selected={selectedItems}
            folderName={title}
            folderCount={items.length}
            onPreview={(i) => setPreview(i.key)}
            onDownload={() => download(selectedItems)}
          />
        )}
      </div>

      <footer className="statusbar">
        {route.kind !== 'shares' && <span>{items.length} 个项目</span>}
        {hasSel && (
          <span>
            已选择 {selectedItems.length} 个项目{selectedSize > 0 && ` · ${fmtBytes(selectedSize)}`}
          </span>
        )}
        {clipboard && (
          <span className="clip-status">
            {clipboard.mode === 'cut' ? <Scissors size={13} /> : <Copy size={13} />} 剪贴板中有 {clipboard.paths.length} 个项目
            <button className="link" onClick={() => setClipboard(null)}>
              清除
            </button>
          </span>
        )}
        <span className="status-spacer" />
        {route.kind === 'dir' && (
          <span className="view-toggle" role="group" aria-label="视图">
            <button className={prefs.view === 'details' ? 'on' : ''} onClick={() => setPref('view', 'details')} title="详细信息" aria-label="详细信息">
              <List size={16} />
            </button>
            <button className={prefs.view === 'lg' ? 'on' : ''} onClick={() => setPref('view', 'lg')} title="大图标" aria-label="大图标">
              <LayoutGrid size={16} />
            </button>
          </span>
        )}
      </footer>

      <input
        ref={fileInput}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files) startUpload(sourcesFromInput(e.target.files), uploadDest.current);
          e.target.value = '';
        }}
      />
      <input
        ref={folderInput}
        type="file"
        multiple
        hidden
        {...({ webkitdirectory: '', directory: '' } as Record<string, string>)}
        onChange={(e) => {
          if (e.target.files) startUpload(sourcesFromInput(e.target.files), uploadDest.current);
          e.target.value = '';
        }}
      />

      <Transfers onOpenDir={openDirStable} />
      {menu && <ContextMenu items={menu.items} x={menu.x} y={menu.y} onClose={() => setMenu(null)} />}
      {preview && previewItems.some((i) => i.key === preview) && (
        <Preview
          items={previewItems}
          startKey={preview}
          onClose={() => {
            setPreview(null);
            viewRef.current?.focus();
          }}
        />
      )}
      <div className="toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.tone}`}>
            <span>{t.text}</span>
            {t.action && (
              <button
                className="link"
                onClick={() => {
                  t.action!.run();
                  setToasts((all) => all.filter((x) => x.id !== t.id));
                }}
              >
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
