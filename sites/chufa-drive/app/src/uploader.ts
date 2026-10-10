import { ApiError, BASE, request, type ConflictMode } from './api';

export type TaskStatus = 'queued' | 'uploading' | 'done' | 'error' | 'canceled' | 'skipped';

export interface UploadTask {
  id: number;
  file: File;
  dir: string;
  relPath: string;
  loaded: number;
  status: TaskStatus;
  error?: string;
  conflict: ConflictMode;
  speed: number;
  savedAs?: string;
}

export interface UploadSource {
  file: File;
  relPath: string;
}

type Listener = () => void;

const CONCURRENCY = 3;
const RETRY_DELAYS = [1000, 2000, 4000, 8000, 15000, 30000];

function putChunk(url: string, blob: Blob, onProgress: (n: number) => void, signal: AbortSignal): Promise<{ offset: number }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.setRequestHeader('X-Drive-Request', '1');
    xhr.setRequestHeader('Content-Type', 'application/octet-stream');
    xhr.responseType = 'json';
    xhr.upload.onprogress = (e) => onProgress(e.loaded);
    xhr.onload = () => {
      const data = xhr.response ?? {};
      if (xhr.status >= 200 && xhr.status < 300) resolve(data);
      else reject(new ApiError(xhr.status, data.error ?? 'HTTP', data.message ?? `上传失败（${xhr.status}）`, data));
    };
    xhr.onerror = () => reject(new ApiError(0, 'NETWORK', '网络中断', {}));
    xhr.ontimeout = () => reject(new ApiError(0, 'NETWORK', '上传超时', {}));
    const abort = () => xhr.abort();
    signal.addEventListener('abort', abort, { once: true });
    xhr.onabort = () => reject(new DOMException('aborted', 'AbortError'));
    xhr.send(blob);
  });
}

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(t);
        reject(new DOMException('aborted', 'AbortError'));
      },
      { once: true },
    );
  });

export class Uploader {
  tasks: UploadTask[] = [];
  chunkSize = 8 * 1024 * 1024;
  private seq = 0;
  private listeners = new Set<Listener>();
  private controllers = new Map<number, AbortController>();
  private active = 0;
  private emitTimer: number | null = null;
  private snapshot: UploadTask[] = [];
  onFileDone: ((dir: string) => void) | null = null;

  subscribe = (fn: Listener) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  getSnapshot = () => this.snapshot;

  private emit(now = false) {
    const flush = () => {
      this.emitTimer = null;
      this.snapshot = this.tasks.map((t) => ({ ...t }));
      this.listeners.forEach((l) => l());
    };
    if (now) {
      if (this.emitTimer) clearTimeout(this.emitTimer);
      flush();
    } else if (!this.emitTimer) {
      this.emitTimer = window.setTimeout(flush, 150);
    }
  }

  add(sources: UploadSource[], dir: string, conflict: ConflictMode) {
    for (const s of sources) {
      this.tasks.push({ id: ++this.seq, file: s.file, dir, relPath: s.relPath, loaded: 0, status: 'queued', conflict, speed: 0 });
    }
    this.emit(true);
    this.pump();
  }

  cancel(id: number) {
    const t = this.tasks.find((x) => x.id === id);
    if (!t || t.status === 'done') return;
    this.controllers.get(id)?.abort();
    if (t.status === 'queued' || t.status === 'error') t.status = 'canceled';
    this.emit(true);
  }

  cancelAll() {
    for (const t of this.tasks) if (t.status === 'queued' || t.status === 'uploading') this.cancel(t.id);
  }

  retry(id: number) {
    const t = this.tasks.find((x) => x.id === id);
    if (!t || (t.status !== 'error' && t.status !== 'canceled')) return;
    t.status = 'queued';
    t.error = undefined;
    this.emit(true);
    this.pump();
  }

  retryFailed() {
    for (const t of this.tasks) if (t.status === 'error') this.retry(t.id);
  }

  clearFinished() {
    this.tasks = this.tasks.filter((t) => t.status === 'queued' || t.status === 'uploading');
    this.emit(true);
  }

  get busy() {
    return this.tasks.some((t) => t.status === 'queued' || t.status === 'uploading');
  }

  private pump() {
    while (this.active < CONCURRENCY) {
      const next = this.tasks.find((t) => t.status === 'queued');
      if (!next) return;
      this.active++;
      next.status = 'uploading';
      this.run(next).finally(() => {
        this.active--;
        this.controllers.delete(next.id);
        this.emit(true);
        this.pump();
      });
    }
  }

  private async run(t: UploadTask) {
    const ac = new AbortController();
    this.controllers.set(t.id, ac);
    const { signal } = ac;
    let serverId: string | undefined;
    try {
      const init = async () =>
        request<{ id?: string; offset?: number; skipped?: boolean }>(
          'POST',
          '/api/upload/init',
          { dir: t.dir, relPath: t.relPath, size: t.file.size, lastModified: t.file.lastModified, conflict: t.conflict },
          { signal },
        );
      let info = await init();
      if (info.skipped) {
        t.status = 'skipped';
        t.loaded = t.file.size;
        return;
      }
      serverId = info.id!;
      let offset = info.offset ?? 0;
      t.loaded = offset;
      let attempt = 0;
      let windowStart = performance.now();
      let windowBytes = offset;

      while (offset < t.file.size) {
        const end = Math.min(offset + this.chunkSize, t.file.size);
        const base = offset;
        try {
          const r = await putChunk(
            `${BASE}/api/upload/${serverId}?offset=${offset}`,
            t.file.slice(offset, end),
            (n) => {
              t.loaded = base + n;
              const now = performance.now();
              if (now - windowStart > 800) {
                t.speed = (t.loaded - windowBytes) / ((now - windowStart) / 1000);
                windowStart = now;
                windowBytes = t.loaded;
              }
              this.emit();
            },
            signal,
          );
          offset = r.offset;
          t.loaded = offset;
          attempt = 0;
          this.emit();
        } catch (e) {
          if ((e as Error).name === 'AbortError') throw e;
          const err = e as ApiError;
          if (err.code === 'OFFSET' && typeof err.data.offset === 'number') {
            offset = err.data.offset;
            continue;
          }
          if (err.code === 'NO_UPLOAD') {
            info = await init();
            serverId = info.id!;
            offset = info.offset ?? 0;
            continue;
          }
          const retriable = err.status === 0 || err.status >= 500 || err.code === 'INTERRUPTED' || err.code === 'BUSY';
          if (!retriable || attempt >= RETRY_DELAYS.length) throw e;
          t.error = `${err.message}，正在重试…`;
          this.emit(true);
          await sleep(RETRY_DELAYS[attempt++], signal);
          t.error = undefined;
          // ask the server where we really are before resending
          info = await init();
          serverId = info.id!;
          offset = info.offset ?? 0;
        }
      }
      const done = await request<{ entry?: { name: string }; skipped?: boolean }>(
        'POST',
        `/api/upload/${serverId}/complete`,
        { conflict: t.conflict === 'fail' ? 'rename' : t.conflict },
        { signal },
      );
      t.status = done.skipped ? 'skipped' : 'done';
      t.savedAs = done.entry?.name;
      t.loaded = t.file.size;
      this.onFileDone?.(t.dir);
    } catch (e) {
      if ((e as Error).name === 'AbortError') {
        // free the partial file on the server right away (disk space is tight)
        if (serverId) request('DELETE', `/api/upload/${serverId}`).catch(() => {});
        t.status = 'canceled';
        t.error = undefined;
      } else {
        t.status = 'error';
        t.error = (e as Error).message || '上传失败';
      }
    }
  }
}

export const uploader = new Uploader();

// ---------- gathering files from drag & drop / inputs ----------
interface FsEntry {
  isFile: boolean;
  isDirectory: boolean;
  name: string;
  file?: (ok: (f: File) => void, fail: (e: unknown) => void) => void;
  createReader?: () => { readEntries: (ok: (list: FsEntry[]) => void, fail: (e: unknown) => void) => void };
}

async function walkEntry(entry: FsEntry, prefix: string, out: UploadSource[], emptyDirs: string[]) {
  if (entry.isFile && entry.file) {
    const file = await new Promise<File>((ok, fail) => entry.file!(ok, fail));
    out.push({ file, relPath: prefix + file.name });
  } else if (entry.isDirectory && entry.createReader) {
    const reader = entry.createReader();
    const all: FsEntry[] = [];
    // readEntries returns results in batches of ~100
    for (;;) {
      const batch = await new Promise<FsEntry[]>((ok, fail) => reader.readEntries(ok, fail));
      if (!batch.length) break;
      all.push(...batch);
    }
    if (!all.length) emptyDirs.push(prefix + entry.name);
    for (const child of all) await walkEntry(child, `${prefix}${entry.name}/`, out, emptyDirs);
  }
}

export async function sourcesFromDataTransfer(dt: DataTransfer): Promise<{ files: UploadSource[]; emptyDirs: string[] }> {
  const files: UploadSource[] = [];
  const emptyDirs: string[] = [];
  const entries: FsEntry[] = [];
  for (const item of Array.from(dt.items)) {
    if (item.kind !== 'file') continue;
    const entry = (item as DataTransferItem & { webkitGetAsEntry?: () => FsEntry | null }).webkitGetAsEntry?.();
    if (entry) entries.push(entry);
    else {
      const f = item.getAsFile();
      if (f) files.push({ file: f, relPath: f.name });
    }
  }
  for (const e of entries) await walkEntry(e, '', files, emptyDirs);
  return { files, emptyDirs };
}

export function sourcesFromInput(list: FileList): UploadSource[] {
  return Array.from(list).map((file) => ({
    file,
    relPath: (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name,
  }));
}
