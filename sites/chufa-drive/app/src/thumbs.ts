import { BASE, fileUrl, type Entry } from './api';
import { extOf } from './format';

// Images at or below this size are shown directly; larger ones get a cached thumbnail.
const DIRECT_LIMIT = 150 * 1024;
const MAX_SOURCE = 60 * 1024 * 1024;
const EDGE = 320;
const CONCURRENCY = 2;

export const thumbUrl = (path: string, e: Pick<Entry, 'size' | 'mtime'>) =>
  `${BASE}/api/thumb?path=${encodeURIComponent(path)}&v=${e.size.toString(36)}-${Math.round(e.mtime).toString(36)}`;

/** Where an image tile should load from first. */
export function thumbSource(path: string, e: Entry): { src: string; generated: boolean } | null {
  if (e.size > MAX_SOURCE) return null;
  const ext = extOf(e.name);
  if (e.size <= DIRECT_LIMIT || ext === 'svg') return { src: fileUrl(path), generated: false };
  return { src: thumbUrl(path, e), generated: true };
}

const pending = new Map<string, Promise<string | null>>();
const failed = new Set<string>();
const waiting: (() => void)[] = [];
let running = 0;

async function slot<T>(work: () => Promise<T>): Promise<T> {
  if (running >= CONCURRENCY) await new Promise<void>((r) => waiting.push(r));
  running++;
  try {
    return await work();
  } finally {
    running--;
    waiting.shift()?.();
  }
}

async function render(path: string): Promise<Blob> {
  const res = await fetch(fileUrl(path), { credentials: 'same-origin' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  // createImageBitmap decodes off the main thread and honours EXIF orientation
  const full = await createImageBitmap(await res.blob());
  const scale = Math.min(1, EDGE / Math.max(full.width, full.height));
  const w = Math.max(1, Math.round(full.width * scale));
  const h = Math.max(1, Math.round(full.height * scale));
  const small = await createImageBitmap(full, { resizeWidth: w, resizeHeight: h, resizeQuality: 'high' });
  full.close();
  let blob: Blob | null;
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(w, h);
    canvas.getContext('2d')!.drawImage(small, 0, 0);
    blob = await canvas.convertToBlob({ type: 'image/webp', quality: 0.82 });
  } else {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d')!.drawImage(small, 0, 0);
    blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/webp', 0.82));
  }
  small.close();
  if (!blob) throw new Error('encode failed');
  return blob;
}

/**
 * Build a thumbnail in the browser, upload it for next time and return a URL for it.
 * Returns null when the image can't be decoded (e.g. HEIC); callers fall back to an icon.
 */
export function generateThumb(path: string, e: Entry): Promise<string | null> {
  const key = thumbUrl(path, e);
  if (failed.has(key)) return Promise.resolve(null);
  let job = pending.get(key);
  if (!job) {
    job = slot(async () => {
      try {
        const blob = await render(path);
        const put = await fetch(key, {
          method: 'PUT',
          credentials: 'same-origin',
          headers: { 'X-Drive-Request': '1', 'Content-Type': blob.type },
          body: blob,
        }).catch(() => null);
        // served from the server next time; this session uses the local copy right away
        void put;
        return URL.createObjectURL(blob);
      } catch {
        failed.add(key);
        return null;
      } finally {
        pending.delete(key);
      }
    });
    pending.set(key, job);
  }
  return job;
}
