export const BASE = '/drive';

export type EntryType = 'dir' | 'file';

export interface Entry {
  name: string;
  type: EntryType;
  size: number;
  mtime: number;
  ctime: number;
  items?: number;
  hasDirs?: boolean;
  /** only present in search results */
  parent?: string;
}

export interface TrashItem {
  id: string;
  name: string;
  original: string;
  type: EntryType;
  size: number;
  mtime: number;
  deletedAt: number;
}

export interface Storage {
  used: number;
  trash: number;
  diskTotal: number;
  diskFree: number;
  reserve: number;
  available: number;
}

export interface Props extends Entry {
  path: string;
  atime: number;
  bytes?: number;
  files?: number;
  dirs?: number;
  truncated?: boolean;
}

export type ConflictMode = 'fail' | 'rename' | 'overwrite' | 'skip';

export interface Share {
  id: string;
  url: string;
  label: string;
  paths: string[];
  names: string[];
  types: EntryType[];
  createdAt: number;
  expiresAt: number | null;
  downloads: number;
  lastDownloadAt: number | null;
  missing?: boolean;
}

export interface PublicShare {
  id: string;
  label: string;
  createdAt: number;
  expiresAt: number | null;
  kind: 'file' | 'zip';
  items: (Entry & { bytes?: number; files?: number })[];
  total: number;
}

export class ApiError extends Error {
  status: number;
  code: string;
  data: Record<string, unknown>;
  constructor(status: number, code: string, message: string, data: Record<string, unknown>) {
    super(message);
    this.status = status;
    this.code = code;
    this.data = data;
  }
  get conflicts(): string[] {
    return Array.isArray(this.data.conflicts) ? (this.data.conflicts as string[]) : [];
  }
}

let onUnauthenticated: (() => void) | null = null;
export const setUnauthenticatedHandler = (fn: () => void) => {
  onUnauthenticated = fn;
};

export async function request<T>(method: string, route: string, body?: unknown, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${route}`, {
      method,
      credentials: 'same-origin',
      ...init,
      headers: {
        'X-Drive-Request': '1',
        ...(body !== undefined && !(body instanceof Blob) ? { 'Content-Type': 'application/json' } : {}),
        ...(init.headers ?? {}),
      },
      body: body === undefined ? undefined : body instanceof Blob ? body : JSON.stringify(body),
    });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new ApiError(0, 'NETWORK', '网络连接失败，请检查网络后重试', {});
  }
  const data = res.headers.get('content-type')?.includes('json') ? await res.json().catch(() => ({})) : {};
  if (!res.ok) {
    if (res.status === 401 && route !== '/api/login' && route !== '/api/password') onUnauthenticated?.();
    throw new ApiError(res.status, data.error ?? 'HTTP', data.message ?? `请求失败（${res.status}）`, data);
  }
  return data as T;
}

const q = (path: string) => `path=${encodeURIComponent(path)}`;

export const api = {
  session: () => request<{ user: string }>('GET', '/api/session'),
  login: (username: string, password: string, remember: boolean) =>
    request<{ user: string }>('POST', '/api/login', { username, password, remember }),
  logout: () => request('POST', '/api/logout', {}),
  password: (current: string, next: string) => request('POST', '/api/password', { current, next }),
  status: () => request<{ storage: Storage; chunkSize: number }>('GET', '/api/status'),
  list: (path: string, signal?: AbortSignal) =>
    request<{ path: string; entries: Entry[] }>('GET', `/api/list?${q(path)}`, undefined, { signal }),
  search: (path: string, text: string, signal?: AbortSignal) =>
    request<{ path: string; entries: Entry[]; truncated?: boolean }>(
      'GET',
      `/api/search?${q(path)}&q=${encodeURIComponent(text)}`,
      undefined,
      { signal },
    ),
  props: (path: string) => request<Props>('GET', `/api/props?${q(path)}`),
  mkdir: (path: string, name: string) => request<Entry>('POST', '/api/mkdir', { path, name }),
  rename: (path: string, name: string) => request<Entry>('POST', '/api/rename', { path, name }),
  move: (paths: string[], dest: string, conflict: ConflictMode = 'fail') =>
    request<{ moved: string[] }>('POST', '/api/move', { paths, dest, conflict }),
  copy: (paths: string[], dest: string, conflict: ConflictMode = 'fail') =>
    request<{ copied: string[] }>('POST', '/api/copy', { paths, dest, conflict }),
  remove: (paths: string[], permanent = false) =>
    request<{ deleted: number; trashIds: string[] }>('POST', '/api/delete', { paths, permanent }),
  trash: () => request<{ items: TrashItem[]; retentionDays: number }>('GET', '/api/trash'),
  trashRestore: (ids: string[]) => request<{ restored: string[] }>('POST', '/api/trash/restore', { ids }),
  trashDelete: (ids: string[]) => request('POST', '/api/trash/delete', { ids }),
  trashEmpty: () => request('POST', '/api/trash/empty', {}),
  zip: (paths: string[], name: string) => request<{ url: string; total: number; count: number }>('POST', '/api/zip', { paths, name }),
  shares: () => request<{ shares: Share[] }>('GET', '/api/shares'),
  createShare: (paths: string[], expiresIn: number | null) => request<Share>('POST', '/api/shares', { paths, expiresIn }),
  updateShare: (id: string, expiresIn: number | null) => request<Share>('POST', '/api/shares/update', { id, expiresIn }),
  deleteShares: (ids: string[]) => request<{ revoked: number }>('POST', '/api/shares/delete', { ids }),
  publicShare: (id: string) => request<PublicShare>('GET', `/api/public/share/${encodeURIComponent(id)}`),
};

export const shareLink = (url: string) => `${location.origin}${url}`;
export const publicShareFile = (id: string, view = false) => `${BASE}/api/public/share/${encodeURIComponent(id)}/${view ? 'view' : 'download'}`;

export const EXPIRY_OPTIONS: { label: string; seconds: number | null }[] = [
  { label: '1 小时', seconds: 3600 },
  { label: '1 天', seconds: 86_400 },
  { label: '7 天', seconds: 7 * 86_400 },
  { label: '30 天', seconds: 30 * 86_400 },
  { label: '永久有效', seconds: null },
];

export const fileUrl = (path: string, download = false) => `${BASE}/api/file?${q(path)}${download ? '&dl=1' : ''}`;

export const joinPath = (dir: string, name: string) => (dir === '/' ? `/${name}` : `${dir}/${name}`);
export const parentOf = (path: string) => {
  const i = path.lastIndexOf('/');
  return i <= 0 ? '/' : path.slice(0, i);
};
export const baseName = (path: string) => path.slice(path.lastIndexOf('/') + 1);
export const segmentsOf = (path: string) => path.split('/').filter(Boolean);
