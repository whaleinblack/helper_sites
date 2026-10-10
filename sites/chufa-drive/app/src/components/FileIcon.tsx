import { memo, useId } from 'react';
import type { Entry } from '../api';
import { extOf, kindOf, type Kind } from '../format';

const COLORS: Record<Kind, string> = {
  folder: '#f2b233',
  pdf: '#e5484d',
  word: '#2b6cd4',
  excel: '#1e8e4e',
  ppt: '#e0662d',
  image: '#8e5bd9',
  video: '#d6457a',
  audio: '#0f9d9a',
  archive: '#b7791f',
  code: '#475569',
  text: '#64748b',
  markdown: '#334155',
  data: '#0e7490',
  font: '#7c3aed',
  exe: '#4b5563',
  file: '#94a3b8',
};

export const kindColor = (k: Kind) => COLORS[k];

function Glyph({ kind }: { kind: Kind }) {
  const c = COLORS[kind];
  switch (kind) {
    case 'image':
      return (
        <g>
          <circle cx="24" cy="21" r="3.2" fill={c} opacity="0.55" />
          <path d="M16 33l7-8 5 5 4-4 8 7z" fill={c} opacity="0.75" />
        </g>
      );
    case 'video':
      return <path d="M25 16.5v14l11-7z" fill={c} opacity="0.8" />;
    case 'audio':
      return (
        <g fill={c} opacity="0.8">
          <path d="M28 14v12.4a4 4 0 1 0 2.4 3.6V19h6v-5z" />
        </g>
      );
    case 'archive':
      return (
        <g fill={c} opacity="0.7">
          {[8, 12, 16, 20, 24].map((y, i) => (
            <rect key={y} x={i % 2 ? 29 : 27} y={y} width="4" height="3" rx="0.8" />
          ))}
          <rect x="26.5" y="27" width="7" height="6" rx="1.5" />
        </g>
      );
    case 'code':
      return (
        <path
          d="M23 18l-6 6 6 6M37 18l6 6-6 6M32 15l-4 18"
          fill="none"
          stroke={c}
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.75"
        />
      );
    case 'folder':
      return null;
    default:
      return (
        <g stroke={c} strokeWidth="2.2" strokeLinecap="round" opacity="0.45">
          <path d="M19 16h22M19 21.5h22M19 27h15" />
        </g>
      );
  }
}

export const FolderIcon = memo(function FolderIcon({ size = 64, filled = true, open = false }: { size?: number; filled?: boolean; open?: boolean }) {
  const id = useId();
  return (
    <svg className="file-icon" width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <linearGradient id={`${id}f`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffd97a" />
          <stop offset="1" stopColor="#f6b73c" />
        </linearGradient>
      </defs>
      <path d="M4 14a4 4 0 0 1 4-4h14.2a4 4 0 0 1 2.9 1.2L29 15h27a4 4 0 0 1 4 4v31a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4z" fill="#e3a12c" />
      {filled && <rect x="9" y="18" width="46" height="24" rx="2" fill="#fffdf6" opacity="0.95" />}
      <path
        d={open ? 'M9 26a4 4 0 0 1 3.8-3H58a3 3 0 0 1 2.9 3.8l-5.6 24.3A4 4 0 0 1 51.4 54H8a4 4 0 0 1-4-4z' : 'M4 25a4 4 0 0 1 4-4h48a4 4 0 0 1 4 4v25a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4z'}
        fill={`url(#${id}f)`}
      />
      <path d="M4 26a4 4 0 0 1 4-4h48a4 4 0 0 1 4 4" fill="none" stroke="#fff3c9" strokeWidth="1" opacity="0.8" />
    </svg>
  );
});

export const FileIcon = memo(function FileIcon({ entry, size = 64 }: { entry: Pick<Entry, 'name' | 'type' | 'items'>; size?: number }) {
  const kind = kindOf(entry);
  if (kind === 'folder') return <FolderIcon size={size} filled={(entry.items ?? 1) > 0} />;
  const color = COLORS[kind];
  const ext = extOf(entry.name).slice(0, 4).toUpperCase();
  const tiny = size < 28;
  return (
    <svg className="file-icon" width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <path
        d="M15 3h24.5L53 16.5V57a4 4 0 0 1-4 4H15a4 4 0 0 1-4-4V7a4 4 0 0 1 4-4z"
        fill="var(--icon-page)"
        stroke="var(--icon-page-stroke)"
        strokeWidth="1.4"
      />
      <path d="M39.5 3v9.5a4 4 0 0 0 4 4H53" fill="var(--icon-fold)" stroke="var(--icon-page-stroke)" strokeWidth="1.4" strokeLinejoin="round" />
      {!tiny && <Glyph kind={kind} />}
      {tiny ? (
        <rect x="11" y="40" width="42" height="12" rx="2" fill={color} />
      ) : (
        <>
          <rect x="6" y="38" width={ext.length > 3 ? 40 : 34} height="15" rx="3.5" fill={color} />
          <text x={ext.length > 3 ? 26 : 23} y="49.2" textAnchor="middle" fontSize="10" fontWeight="700" fill="#fff" fontFamily="Segoe UI, system-ui, sans-serif" letterSpacing="0.3">
            {ext || '?'}
          </text>
        </>
      )}
    </svg>
  );
});
