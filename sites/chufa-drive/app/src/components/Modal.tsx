import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';

export function Modal({
  title,
  onClose,
  children,
  footer,
  width = 440,
  icon,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
  icon?: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const previous = useRef<Element | null>(null);

  useEffect(() => {
    previous.current = document.activeElement;
    const el = ref.current;
    const first = el?.querySelector<HTMLElement>('[data-autofocus]') ?? el?.querySelector<HTMLElement>('input, button.primary, button');
    first?.focus();
    if (first instanceof HTMLInputElement) first.select();
    return () => {
      (previous.current as HTMLElement | null)?.focus?.();
    };
  }, []);

  const onKeyDown = (e: React.KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
    if (e.key === 'Tab' && ref.current) {
      const f = Array.from(ref.current.querySelectorAll<HTMLElement>('button, input, select, textarea, [tabindex]:not([tabindex="-1"])')).filter(
        (x) => !x.hasAttribute('disabled'),
      );
      if (!f.length) return;
      const idx = f.indexOf(document.activeElement as HTMLElement);
      if (e.shiftKey && idx <= 0) {
        e.preventDefault();
        f[f.length - 1].focus();
      } else if (!e.shiftKey && idx === f.length - 1) {
        e.preventDefault();
        f[0].focus();
      }
    }
  };

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()} onContextMenu={(e) => e.preventDefault()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} style={{ width }} ref={ref} onKeyDown={onKeyDown}>
        <header className="modal-head">
          {icon && <span className="modal-icon">{icon}</span>}
          <h2>{title}</h2>
          <button className="icon-btn ghost" onClick={onClose} aria-label="关闭">
            <X size={18} />
          </button>
        </header>
        <div className="modal-body">{children}</div>
        {footer && <footer className="modal-foot">{footer}</footer>}
      </div>
    </div>
  );
}
