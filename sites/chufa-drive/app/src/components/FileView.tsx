import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, Check } from 'lucide-react';
import { fileUrl, type Entry } from '../api';
import { previewMode, type SortKey, type SortState } from '../format';
import { generateThumb, thumbSource } from '../thumbs';
import { FileIcon } from './FileIcon';

export type ViewMode = 'xl' | 'lg' | 'md' | 'sm' | 'list' | 'details' | 'tiles' | 'content';

export const VIEW_LABELS: Record<ViewMode, string> = {
  xl: '超大图标',
  lg: '大图标',
  md: '中等图标',
  sm: '小图标',
  list: '列表',
  details: '详细信息',
  tiles: '平铺',
  content: '内容',
};
export const ZOOM_ORDER: ViewMode[] = ['details', 'list', 'sm', 'md', 'lg', 'xl'];

const ICON_SIZE: Record<ViewMode, number> = { xl: 196, lg: 96, md: 52, sm: 20, list: 20, details: 20, tiles: 48, content: 40 };

export interface ViewItem {
  key: string;
  path: string;
  entry: Entry;
}

export interface Column {
  id: string;
  label: string;
  width: number;
  min?: number;
  align?: 'right';
  sortKey?: SortKey;
  render: (item: ViewItem) => ReactNode;
}

export interface Selection {
  keys: Set<string>;
  focus: string | null;
  anchor: string | null;
}

interface Props {
  items: ViewItem[];
  mode: ViewMode;
  columns: Column[];
  sort: SortState;
  onSort: (key: SortKey) => void;
  onColumnResize: (id: string, width: number) => void;
  selection: Selection;
  onSelection: (s: Selection) => void;
  cutKeys: Set<string>;
  onOpen: (item: ViewItem) => void;
  onContextMenu: (e: React.MouseEvent, item: ViewItem | null) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  renaming: string | null;
  onRenameEnd: (item: ViewItem, name: string | null) => void;
  canDropOn: (item: ViewItem | null, e: React.DragEvent) => boolean;
  onDrop: (item: ViewItem | null, e: React.DragEvent) => void;
  onDragStart: (e: React.DragEvent, item: ViewItem) => void;
  onZoom: (dir: 1 | -1) => void;
  thumbnails: boolean;
  checkboxes: boolean;
  empty: ReactNode;
  subtitle?: (item: ViewItem) => ReactNode;
  viewRef?: React.RefObject<HTMLDivElement | null>;
}

function ImageThumb({ item, size, onFail }: { item: ViewItem; size: number; onFail: () => void }) {
  const source = thumbSource(item.path, item.entry);
  const [src, setSrc] = useState(source?.src ?? null);
  const [loaded, setLoaded] = useState(false);
  const tried = useRef(false);
  useEffect(() => {
    setSrc(source?.src ?? null);
    setLoaded(false);
    tried.current = false;
    // re-evaluate only when the file itself changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.path, item.entry.size, item.entry.mtime]);
  if (!source || !src) return <FileIcon entry={item.entry} size={size} />;
  const onError = () => {
    // no cached thumbnail yet: build one in the background (decoded off the main thread)
    if (source.generated && !tried.current) {
      tried.current = true;
      generateThumb(item.path, item.entry).then((url) => (url ? setSrc(url) : onFail()));
    } else onFail();
  };
  return (
    <span className="thumb" style={{ width: size, height: size }}>
      {!loaded && <FileIcon entry={item.entry} size={Math.round(size * 0.8)} />}
      <img
        src={src}
        alt=""
        loading="lazy"
        decoding="async"
        draggable={false}
        className={loaded ? '' : 'pending'}
        onLoad={() => setLoaded(true)}
        onError={onError}
      />
    </span>
  );
}

function Thumb({ item, size, mode }: { item: ViewItem; size: number; mode: ViewMode }) {
  const [failed, setFailed] = useState(false);
  const big = mode === 'xl' || mode === 'lg' || mode === 'md' || mode === 'tiles' || mode === 'content';
  if (big && !failed && previewMode(item.entry) === 'image') {
    return <ImageThumb item={item} size={size} onFail={() => setFailed(true)} />;
  }
  if ((mode === 'xl' || mode === 'lg') && !failed && previewMode(item.entry) === 'video' && item.entry.size < 2 * 1024 ** 3) {
    return (
      <span className="thumb video" style={{ width: size, height: size }}>
        <video src={`${fileUrl(item.path)}#t=1`} preload="metadata" muted playsInline onError={() => setFailed(true)} />
      </span>
    );
  }
  return <FileIcon entry={item.entry} size={size} />;
}

function RenameInput({ initial, isDir, onDone }: { initial: string; isDir: boolean; onDone: (v: string | null) => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const done = useRef(false);
  const finish = (v: string | null) => {
    if (done.current) return;
    done.current = true;
    onDone(v);
  };
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    const dot = initial.lastIndexOf('.');
    el.setSelectionRange(0, !isDir && dot > 0 ? dot : initial.length);
  }, [initial, isDir]);
  return (
    <textarea
      ref={ref}
      className="rename-input"
      defaultValue={initial}
      rows={1}
      spellCheck={false}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') {
          e.preventDefault();
          finish(e.currentTarget.value.trim() || null);
        } else if (e.key === 'Escape') {
          e.preventDefault();
          finish(null);
        }
      }}
      onBlur={(e) => finish(e.currentTarget.value.trim() || null)}
    />
  );
}

const Item = memo(function Item({
  item,
  mode,
  columns,
  selected,
  focused,
  cut,
  renaming,
  dropping,
  checkboxes,
  thumbnails,
  subtitle,
  onRenameEnd,
}: {
  item: ViewItem;
  mode: ViewMode;
  columns: Column[];
  selected: boolean;
  focused: boolean;
  cut: boolean;
  renaming: boolean;
  dropping: boolean;
  checkboxes: boolean;
  thumbnails: boolean;
  subtitle?: ReactNode;
  onRenameEnd: (item: ViewItem, name: string | null) => void;
}) {
  const size = ICON_SIZE[mode];
  const icon = thumbnails ? <Thumb item={item} size={size} mode={mode} /> : <FileIcon entry={item.entry} size={size} />;
  const name = renaming ? (
    <RenameInput initial={item.entry.name} isDir={item.entry.type === 'dir'} onDone={(v) => onRenameEnd(item, v)} />
  ) : (
    <span className="item-name" title={item.entry.name}>
      {item.entry.name}
    </span>
  );
  const cls = `item ${selected ? 'selected' : ''} ${focused ? 'focused' : ''} ${cut ? 'cut' : ''} ${dropping ? 'drop-target' : ''}`;
  const check = checkboxes && (
    <span className="item-check" data-check aria-hidden="true">
      {selected && <Check size={12} strokeWidth={3} />}
    </span>
  );

  if (mode === 'details') {
    return (
      <div className={cls} data-key={item.key} role="row" aria-selected={selected} draggable={!renaming}>
        {columns.map((c, i) => (
          <div key={c.id} role="gridcell" className={`cell ${c.align === 'right' ? 'right' : ''} ${i === 0 ? 'cell-name' : ''}`}>
            {i === 0 ? (
              <>
                {check}
                <span className="item-icon">{icon}</span>
                {name}
              </>
            ) : (
              c.render(item)
            )}
          </div>
        ))}
      </div>
    );
  }
  if (mode === 'tiles' || mode === 'content') {
    return (
      <div className={cls} data-key={item.key} role="option" aria-selected={selected} draggable={!renaming}>
        {check}
        <span className="item-icon">{icon}</span>
        <span className="item-text">
          {name}
          <span className="item-sub">{subtitle}</span>
        </span>
      </div>
    );
  }
  return (
    <div className={cls} data-key={item.key} role="option" aria-selected={selected} draggable={!renaming}>
      {check}
      <span className="item-icon">{icon}</span>
      {name}
    </div>
  );
});

export function FileView(props: Props) {
  const {
    items,
    mode,
    columns,
    sort,
    selection,
    onSelection,
    cutKeys,
    renaming,
    thumbnails,
    checkboxes,
  } = props;
  const localRef = useRef<HTMLDivElement>(null);
  const ref = props.viewRef ?? localRef;
  const bodyRef = useRef<HTMLDivElement>(null);
  const marqueeRef = useRef<HTMLDivElement>(null);
  const [marqueeActive, setMarqueeActive] = useState(false);
  const marqueeLive = useRef(false);
  const [dropKey, setDropKey] = useState<string | null>(null);
  const [rows, setRows] = useState(10);
  const typeAhead = useRef({ text: '', at: 0 });
  const pointerType = useRef('mouse');
  const pressed = useRef<{ key: string; wasSelected: boolean; ctrl: boolean; shift: boolean } | null>(null);

  const keyMap = useMemo(() => new Map(items.map((it, i) => [it.key, i])), [items]);
  const keyIndex = useRef(keyMap);
  keyIndex.current = keyMap;
  const itemByKey = (k: string) => items[keyIndex.current.get(k) ?? -1];

  // list mode flows in columns; compute row count from height
  useLayoutEffect(() => {
    if (mode !== 'list' || !ref.current) return;
    const el = ref.current;
    const ro = new ResizeObserver(() => setRows(Math.max(1, Math.floor((el.clientHeight - 16) / 28))));
    ro.observe(el);
    return () => ro.disconnect();
  }, [mode, ref]);

  const select = useCallback(
    (keys: Iterable<string>, focus: string | null, anchor?: string | null) =>
      onSelection({ keys: new Set(keys), focus, anchor: anchor === undefined ? focus : anchor }),
    [onSelection],
  );

  const rangeKeys = (a: string | null, b: string) => {
    const ia = a ? (keyIndex.current.get(a) ?? 0) : 0;
    const ib = keyIndex.current.get(b) ?? 0;
    const [lo, hi] = ia < ib ? [ia, ib] : [ib, ia];
    return items.slice(lo, hi + 1).map((i) => i.key);
  };

  const keyFromEvent = (e: { target: EventTarget | null }) => (e.target as HTMLElement).closest<HTMLElement>('[data-key]')?.dataset.key ?? null;

  const clickSelect = (key: string, ctrl: boolean, shift: boolean) => {
    if (shift) {
      const range = rangeKeys(selection.anchor ?? selection.focus, key);
      const keys = ctrl ? new Set([...selection.keys, ...range]) : new Set(range);
      onSelection({ keys, focus: key, anchor: selection.anchor ?? key });
    } else if (ctrl) {
      const keys = new Set(selection.keys);
      if (keys.has(key)) keys.delete(key);
      else keys.add(key);
      onSelection({ keys, focus: key, anchor: key });
    } else {
      select([key], key);
    }
  };

  // ---------- pointer: click, marquee ----------
  // Marquee selection is driven imperatively: pointer moves only record the position, one
  // requestAnimationFrame loop draws the box (no React state) and hit-tests, and the
  // selection is pushed to the parent only when the set of hit items actually changes.
  const startMarquee = (e: React.PointerEvent, rowKey: string | null) => {
    const body = bodyRef.current;
    const scroller = ref.current;
    const box = marqueeRef.current;
    if (!body || !scroller || !box) return;
    e.preventDefault();
    scroller.focus({ preventScroll: true });
    const ctrl = e.ctrlKey || e.metaKey;
    const shift = e.shiftKey;
    const origin = scroller.getBoundingClientRect();
    let scrollX = scroller.scrollLeft;
    let scrollY = scroller.scrollTop;
    const startX = e.clientX - origin.left + scrollX;
    const startY = e.clientY - origin.top + scrollY;
    const base = ctrl ? new Set(selection.keys) : new Set<string>();
    // on blank space the selection clears at once (like Explorer); on a row's blank area we
    // wait, because a click without movement selects that row instead
    if (!ctrl && !rowKey && selection.keys.size) select([], null);
    let rects: { key: string; l: number; t: number; r: number; b: number }[] = [];
    let client = { x: e.clientX, y: e.clientY };
    let moved = false;
    let dirty = false;
    let frame = 0;
    let prevHit: Set<string> | null = null;
    let lastKey: string | null = null;

    const measure = () =>
      Array.from(body.querySelectorAll<HTMLElement>('[data-key]')).map((el) => {
        const r = el.getBoundingClientRect();
        return {
          key: el.dataset.key!,
          l: r.left - origin.left + scrollX,
          t: r.top - origin.top + scrollY,
          r: r.right - origin.left + scrollX,
          b: r.bottom - origin.top + scrollY,
        };
      });

    const render = () => {
      const cx = client.x - origin.left + scrollX;
      const cy = client.y - origin.top + scrollY;
      const x = Math.min(startX, cx);
      const y = Math.min(startY, cy);
      const w = Math.abs(cx - startX);
      const h = Math.abs(cy - startY);
      if (!moved) {
        if (w < 4 && h < 4) return;
        moved = true;
        marqueeLive.current = true;
        setMarqueeActive(true);
        rects = measure();
        box.style.display = 'block';
      }
      box.style.transform = `translate(${x}px, ${y}px)`;
      box.style.width = `${w}px`;
      box.style.height = `${h}px`;
      const hit = new Set(base);
      let last: string | null = null;
      for (const r of rects) {
        if (r.r > x && r.l < x + w && r.b > y && r.t < y + h) {
          if (base.has(r.key)) hit.delete(r.key);
          else hit.add(r.key);
          last = r.key;
        }
      }
      lastKey = last;
      const prev = prevHit;
      if (prev && prev.size === hit.size && [...hit].every((k) => prev.has(k))) return;
      prevHit = hit;
      onSelection({ keys: hit, focus: null, anchor: null });
    };

    const loop = () => {
      frame = requestAnimationFrame(loop);
      // auto-scroll while the pointer is held near an edge
      const edge = 36;
      let dx = 0;
      let dy = 0;
      if (moved) {
        if (client.y < origin.top + edge) dy = -Math.ceil((origin.top + edge - client.y) / 3);
        else if (client.y > origin.bottom - edge) dy = Math.ceil((client.y - origin.bottom + edge) / 3);
        if (client.x < origin.left + edge) dx = -Math.ceil((origin.left + edge - client.x) / 3);
        else if (client.x > origin.right - edge) dx = Math.ceil((client.x - origin.right + edge) / 3);
      }
      if (dx || dy) {
        scroller.scrollBy(dx, dy);
        scrollX = scroller.scrollLeft;
        scrollY = scroller.scrollTop;
        dirty = true;
      }
      if (dirty) {
        dirty = false;
        render();
      }
    };
    frame = requestAnimationFrame(loop);

    const move = (ev: PointerEvent) => {
      client = { x: ev.clientX, y: ev.clientY };
      dirty = true;
    };
    const onScroll = () => {
      scrollX = scroller.scrollLeft;
      scrollY = scroller.scrollTop;
      dirty = true;
    };
    const up = (ev: PointerEvent) => {
      cancelAnimationFrame(frame);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      scroller.removeEventListener('scroll', onScroll);
      if (ev.type === 'pointerup') client = { x: ev.clientX, y: ev.clientY };
      if (!moved) render(); // a quick flick can finish between two frames
      box.style.display = 'none';
      marqueeLive.current = false;
      if (moved) {
        render();
        box.style.display = 'none';
        setMarqueeActive(false);
        onSelection({ keys: prevHit ?? base, focus: lastKey, anchor: lastKey });
      } else if (rowKey && ev.type === 'pointerup') {
        clickSelect(rowKey, ctrl, shift);
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    scroller.addEventListener('scroll', onScroll, { passive: true });
  };

  const onPointerDown = (e: React.PointerEvent) => {
    pointerType.current = e.pointerType;
    if (e.button !== 0 && e.button !== 2) return;
    const target = e.target as HTMLElement;
    if (target.closest('.view-header, .rename-input')) return;
    const key = keyFromEvent(e);
    const ctrl = e.ctrlKey || e.metaKey;
    if (key) {
      const isCheck = !!target.closest('[data-check]');
      if (e.button === 2) {
        if (!selection.keys.has(key)) select([key], key);
        return;
      }
      if (e.pointerType === 'touch') return; // handled on click
      // details view: dragging from the blank part of an unselected row draws a marquee
      if (mode === 'details' && !isCheck && !target.closest('.item-icon, .item-name') && !selection.keys.has(key) && !e.shiftKey) {
        startMarquee(e, key);
        return;
      }
      const wasSelected = selection.keys.has(key);
      pressed.current = { key, wasSelected, ctrl: ctrl || isCheck, shift: e.shiftKey };
      if (isCheck) return; // toggle on click
      // defer collapsing a multi-selection until click so drags keep the group
      if (!(wasSelected && !ctrl && !e.shiftKey)) clickSelect(key, ctrl, e.shiftKey);
      return;
    }
    if (e.button === 2) {
      if (selection.keys.size) select([], null);
      return;
    }
    if (e.pointerType === 'touch') return;
    startMarquee(e, null);
  };

  const onClick = (e: React.MouseEvent) => {
    const key = keyFromEvent(e);
    if (!key) return;
    const isCheck = !!(e.target as HTMLElement).closest('[data-check]');
    if (pointerType.current === 'touch') {
      if (selection.keys.size || isCheck) clickSelect(key, true, false);
      else {
        const it = itemByKey(key);
        if (it) props.onOpen(it);
      }
      return;
    }
    const p = pressed.current;
    pressed.current = null;
    if (!p || p.key !== key) return;
    if (isCheck) clickSelect(key, true, false);
    else if (p.wasSelected && !p.ctrl && !p.shift) select([key], key);
  };

  const onDoubleClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('[data-check]')) return;
    const key = keyFromEvent(e);
    const it = key ? itemByKey(key) : null;
    if (it && !renaming) props.onOpen(it);
  };

  const onContextMenu = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.rename-input, .view-header')) return;
    e.preventDefault();
    const key = keyFromEvent(e);
    props.onContextMenu(e, key ? itemByKey(key) : null);
  };

  // ---------- keyboard ----------
  const neighbour = (from: string | null, dir: 'up' | 'down' | 'left' | 'right'): string | null => {
    if (!items.length) return null;
    if (!from || !keyIndex.current.has(from)) return items[0].key;
    const idx = keyIndex.current.get(from)!;
    if (mode === 'details' || mode === 'content') {
      if (dir === 'up') return items[Math.max(0, idx - 1)].key;
      if (dir === 'down') return items[Math.min(items.length - 1, idx + 1)].key;
      return null;
    }
    if (mode === 'list') {
      const step = dir === 'up' || dir === 'down' ? 1 : rows;
      const n = dir === 'up' || dir === 'left' ? idx - step : idx + step;
      return items[Math.min(items.length - 1, Math.max(0, n))].key;
    }
    if (dir === 'left') return items[Math.max(0, idx - 1)].key;
    if (dir === 'right') return items[Math.min(items.length - 1, idx + 1)].key;
    // grid: find nearest item in the next/previous row
    const body = bodyRef.current;
    const el = body?.querySelector<HTMLElement>(`[data-key="${CSS.escape(from)}"]`);
    if (!body || !el) return null;
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    let best: string | null = null;
    let bestScore = Infinity;
    for (const other of body.querySelectorAll<HTMLElement>('[data-key]')) {
      const o = other.getBoundingClientRect();
      const dy = dir === 'down' ? o.top - r.top : r.top - o.top;
      if (dy < r.height / 2) continue;
      const score = dy * 1000 + Math.abs(o.left + o.width / 2 - cx);
      if (score < bestScore) {
        bestScore = score;
        best = other.dataset.key!;
      }
    }
    if (!best) return dir === 'down' ? items[items.length - 1].key : items[0].key;
    return best;
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if ((e.target as HTMLElement).closest('.rename-input')) return;
    const arrows: Record<string, 'up' | 'down' | 'left' | 'right'> = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };
    const ctrl = e.ctrlKey || e.metaKey;
    let target: string | null = null;
    if (arrows[e.key] && !e.altKey) target = neighbour(selection.focus, arrows[e.key]);
    else if (e.key === 'Home' && items.length) target = items[0].key;
    else if (e.key === 'End' && items.length) target = items[items.length - 1].key;
    else if ((e.key === 'PageDown' || e.key === 'PageUp') && items.length) {
      const jump = Math.max(1, Math.floor((ref.current?.clientHeight ?? 400) / 32));
      const idx = keyIndex.current.get(selection.focus ?? '') ?? 0;
      target = items[Math.max(0, Math.min(items.length - 1, idx + (e.key === 'PageDown' ? jump : -jump)))].key;
    } else if (e.key === ' ' && ctrl && selection.focus) {
      e.preventDefault();
      clickSelect(selection.focus, true, false);
      return;
    } else if (e.key.length === 1 && !ctrl && !e.altKey && e.key !== ' ' && items.length) {
      // type-ahead find
      const now = Date.now();
      const ta = typeAhead.current;
      ta.text = now - ta.at > 900 ? e.key.toLowerCase() : ta.text + e.key.toLowerCase();
      ta.at = now;
      const start = keyIndex.current.get(selection.focus ?? '') ?? -1;
      const ordered = [...items.slice(start + (ta.text.length === 1 ? 1 : 0)), ...items];
      const hit = ordered.find((it) => it.entry.name.toLowerCase().startsWith(ta.text));
      if (hit) {
        e.preventDefault();
        select([hit.key], hit.key);
        scrollIntoView(hit.key);
      }
      return;
    }
    if (target !== null) {
      e.preventDefault();
      if (e.shiftKey) {
        const anchor = selection.anchor ?? selection.focus ?? target;
        const range = rangeKeys(anchor, target);
        onSelection({ keys: ctrl ? new Set([...selection.keys, ...range]) : new Set(range), focus: target, anchor });
      } else if (ctrl) {
        onSelection({ ...selection, focus: target });
      } else {
        select([target], target);
      }
      scrollIntoView(target);
      return;
    }
    props.onKeyDown(e);
  };

  const scrollIntoView = (key: string) => {
    requestAnimationFrame(() => {
      bodyRef.current?.querySelector<HTMLElement>(`[data-key="${CSS.escape(key)}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    });
  };

  useEffect(() => {
    if (selection.focus && renaming === null && !marqueeLive.current) {
      const el = bodyRef.current?.querySelector<HTMLElement>(`[data-key="${CSS.escape(selection.focus)}"]`);
      if (el) {
        const r = el.getBoundingClientRect();
        const c = ref.current?.getBoundingClientRect();
        if (c && (r.bottom < c.top || r.top > c.bottom)) el.scrollIntoView({ block: 'nearest' });
      }
    }
    // only when the focused item changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection.focus]);

  // ---------- drag & drop ----------
  const onDragStart = (e: React.DragEvent) => {
    const key = keyFromEvent(e);
    const it = key ? itemByKey(key) : null;
    if (!it || renaming || marqueeLive.current) return e.preventDefault();
    pressed.current = null;
    props.onDragStart(e, it);
  };
  const onDragOver = (e: React.DragEvent) => {
    const key = keyFromEvent(e);
    const it = key ? itemByKey(key) : null;
    const target = it && it.entry.type === 'dir' ? it : null;
    if (props.canDropOn(target, e)) {
      e.preventDefault();
      e.dataTransfer.dropEffect = e.dataTransfer.types.includes('Files') ? 'copy' : e.ctrlKey ? 'copy' : 'move';
      setDropKey(target?.key ?? '');
    } else {
      e.dataTransfer.dropEffect = 'none';
      setDropKey(null);
    }
  };
  const onDrop = (e: React.DragEvent) => {
    const key = keyFromEvent(e);
    const it = key ? itemByKey(key) : null;
    const target = it && it.entry.type === 'dir' ? it : null;
    setDropKey(null);
    if (!props.canDropOn(target, e)) return;
    e.preventDefault();
    props.onDrop(target, e);
  };

  const onWheel = (e: React.WheelEvent) => {
    if (!e.ctrlKey) return;
    e.preventDefault();
    props.onZoom(e.deltaY < 0 ? 1 : -1);
  };

  // Ctrl+wheel must be non-passive to stop browser zoom
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const stop = (e: WheelEvent) => e.ctrlKey && e.preventDefault();
    el.addEventListener('wheel', stop, { passive: false });
    return () => el.removeEventListener('wheel', stop);
  }, [ref]);

  const gridTemplate = columns.map((c) => `${c.width}px`).join(' ');

  const startResize = (e: React.PointerEvent, col: Column) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const start = col.width;
    const move = (ev: PointerEvent) => props.onColumnResize(col.id, Math.max(col.min ?? 60, Math.round(start + ev.clientX - startX)));
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  return (
    <div
      ref={ref}
      className={`view view-${mode} ${checkboxes ? 'with-checks' : ''} ${selection.keys.size ? 'has-selection' : ''} ${dropKey === '' ? 'drop-blank' : ''} ${marqueeActive ? 'marquee-active' : ''}`}
      tabIndex={0}
      role={mode === 'details' ? 'grid' : 'listbox'}
      aria-multiselectable="true"
      aria-label="文件列表"
      onPointerDown={onPointerDown}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
      onKeyDown={onKeyDown}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropKey(null);
      }}
      onDrop={onDrop}
      onDragEnd={() => setDropKey(null)}
      onWheel={onWheel}
      style={{ '--cols': gridTemplate, '--rows': rows } as React.CSSProperties}
    >
      {mode === 'details' && (
        <div className="view-header" role="row">
          {columns.map((c) => (
            <div
              key={c.id}
              role="columnheader"
              className={`col-head ${c.align === 'right' ? 'right' : ''} ${sort.key === c.sortKey ? 'sorted' : ''}`}
              aria-sort={sort.key === c.sortKey ? (sort.dir === 1 ? 'ascending' : 'descending') : undefined}
            >
              <button className="col-btn" onClick={() => c.sortKey && props.onSort(c.sortKey)} disabled={!c.sortKey}>
                <span>{c.label}</span>
                {sort.key === c.sortKey && c.sortKey && (sort.dir === 1 ? <ArrowUp size={13} /> : <ArrowDown size={13} />)}
              </button>
              <span className="col-resize" onPointerDown={(e) => startResize(e, c)} onDoubleClick={() => props.onColumnResize(c.id, c.id === 'name' ? 360 : 160)} />
            </div>
          ))}
        </div>
      )}
      <div className="view-body" ref={bodyRef}>
        {items.map((it) => (
          <Item
            key={it.key}
            item={it}
            mode={mode}
            columns={columns}
            selected={selection.keys.has(it.key)}
            focused={selection.focus === it.key}
            cut={cutKeys.has(it.key)}
            renaming={renaming === it.key}
            dropping={dropKey === it.key}
            checkboxes={checkboxes}
            thumbnails={thumbnails}
            subtitle={mode === 'tiles' || mode === 'content' ? props.subtitle?.(it) : undefined}
            onRenameEnd={props.onRenameEnd}
          />
        ))}
      </div>
      {!items.length && props.empty}
      <div ref={marqueeRef} className="marquee" aria-hidden="true" />
    </div>
  );
}
