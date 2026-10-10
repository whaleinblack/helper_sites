import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Check, ChevronRight, Dot } from 'lucide-react';

export type MenuItem =
  | 'sep'
  | {
      label: string;
      icon?: ReactNode;
      shortcut?: string;
      onClick?: () => void;
      disabled?: boolean;
      danger?: boolean;
      checked?: boolean;
      radio?: boolean;
      submenu?: MenuItem[];
      hidden?: boolean;
    };

function MenuList({ items, x, y, altX, onClose, depth = 0 }: { items: MenuItem[]; x: number; y: number; altX?: number; onClose: () => void; depth?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y, ready: false });
  const [open, setOpen] = useState<{ index: number; x: number; y: number; altX: number } | null>(null);
  const [active, setActive] = useState(-1);
  const visible = items.filter((i) => i === 'sep' || !i.hidden);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let left = x;
    let top = y;
    if (left + r.width > vw - 6) left = altX != null ? altX - r.width : vw - r.width - 6;
    if (top + r.height > vh - 6) top = Math.max(6, vh - r.height - 6);
    setPos({ left: Math.max(6, left), top, ready: true });
  }, [x, y, altX]);

  useEffect(() => {
    if (depth === 0) ref.current?.focus();
  }, [depth]);

  const actionable = visible.map((it, i) => (it !== 'sep' && !it.disabled ? i : -1)).filter((i) => i >= 0);

  const openSub = (i: number, el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    setOpen({ index: i, x: r.right - 4, y: r.top - 5, altX: r.left + 4 });
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (open) return;
    e.stopPropagation();
    if (e.key === 'Escape' || (e.key === 'ArrowLeft' && depth > 0)) {
      e.preventDefault();
      onClose();
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const pos = actionable.indexOf(active);
      const next = e.key === 'ArrowDown' ? actionable[(pos + 1) % actionable.length] : actionable[(pos - 1 + actionable.length) % actionable.length];
      setActive(next ?? -1);
    } else if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowRight') {
      const it = visible[active];
      if (!it || it === 'sep') return;
      e.preventDefault();
      if (it.submenu) {
        const el = ref.current?.querySelectorAll<HTMLElement>('.menu-item')[actionableIndexToDom(visible, active)];
        if (el) openSub(active, el);
      } else if (e.key !== 'ArrowRight') {
        it.onClick?.();
        onClose();
      }
    }
  };

  return (
    <>
      <div
        ref={ref}
        className="menu"
        role="menu"
        tabIndex={-1}
        style={{ left: pos.left, top: pos.top, visibility: pos.ready ? 'visible' : 'hidden' }}
        onKeyDown={onKeyDown}
        onContextMenu={(e) => e.preventDefault()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {visible.map((it, i) =>
          it === 'sep' ? (
            <div key={`s${i}`} className="menu-sep" role="separator" />
          ) : (
            <button
              key={it.label}
              role="menuitem"
              className={`menu-item ${it.danger ? 'danger' : ''} ${active === i ? 'active' : ''} ${open?.index === i ? 'open' : ''}`}
              disabled={it.disabled}
              onMouseEnter={(e) => {
                setActive(i);
                if (it.submenu) openSub(i, e.currentTarget);
                else setOpen(null);
              }}
              onClick={(e) => {
                if (it.submenu) return openSub(i, e.currentTarget);
                it.onClick?.();
                onClose();
              }}
            >
              <span className="menu-icon">{it.checked ? it.radio ? <Dot size={22} /> : <Check size={15} /> : it.icon}</span>
              <span className="menu-label">{it.label}</span>
              {it.shortcut && <span className="menu-shortcut">{it.shortcut}</span>}
              {it.submenu && <ChevronRight size={14} className="menu-arrow" />}
            </button>
          ),
        )}
      </div>
      {open && visible[open.index] !== 'sep' && (visible[open.index] as Exclude<MenuItem, 'sep'>).submenu && (
        <MenuList
          items={(visible[open.index] as Exclude<MenuItem, 'sep'>).submenu!}
          x={open.x}
          y={open.y}
          altX={open.altX}
          depth={depth + 1}
          onClose={() => {
            setOpen(null);
            ref.current?.focus();
          }}
        />
      )}
    </>
  );
}

function actionableIndexToDom(items: MenuItem[], index: number) {
  let n = 0;
  for (let i = 0; i < index; i++) if (items[i] !== 'sep') n++;
  return n;
}

export function ContextMenu({ items, x, y, onClose }: { items: MenuItem[]; x: number; y: number; onClose: () => void }) {
  useEffect(() => {
    const close = () => onClose();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('mousedown', close);
    window.addEventListener('blur', close);
    window.addEventListener('resize', close);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('blur', close);
      window.removeEventListener('resize', close);
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);
  return (
    <div className="menu-layer" onWheel={onClose}>
      <MenuList items={wrapLeaves(items, onClose)} x={x} y={y} onClose={onClose} />
    </div>
  );
}

/** Make leaf clicks inside nested submenus close the entire menu tree. */
function wrapLeaves(items: MenuItem[], closeAll: () => void): MenuItem[] {
  return items.map((it) =>
    it === 'sep'
      ? it
      : it.submenu
        ? { ...it, submenu: wrapLeaves(it.submenu, closeAll) }
        : { ...it, onClick: () => {
            it.onClick?.();
            closeAll();
          } },
  );
}
