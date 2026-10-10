import { randomBytes } from 'node:crypto';
import { HttpError, bad, readJson, writeJsonAtomic } from './util.mjs';

const MAX_SHARES = 2000;
const MAX_TTL_SEC = 365 * 86_400;

/**
 * Public download links. A share points at one or more drive paths; anyone holding the
 * (128-bit random) token can download them until it expires or is revoked.
 */
export class ShareStore {
  constructor(file) {
    this.file = file;
    this.shares = new Map();
    this.saving = Promise.resolve();
  }

  async load() {
    const data = await readJson(this.file, { shares: [] });
    for (const s of data.shares ?? []) this.shares.set(s.id, s);
    this.expire();
  }

  save() {
    const snapshot = { shares: [...this.shares.values()] };
    this.saving = this.saving.then(() => writeJsonAtomic(this.file, snapshot)).catch((e) => console.error('share save failed', e.message));
    return this.saving;
  }

  static checkId(id) {
    return typeof id === 'string' && /^[A-Za-z0-9_-]{22}$/.test(id);
  }

  async create({ user, paths, names, types, expiresIn, label }) {
    if (this.shares.size >= MAX_SHARES) throw new HttpError(409, 'TOO_MANY_SHARES', '分享链接数量已达上限，请先删除一些旧链接');
    let expiresAt = null;
    if (expiresIn !== null && expiresIn !== undefined) {
      if (!Number.isFinite(expiresIn) || expiresIn < 60 || expiresIn > MAX_TTL_SEC) throw bad('BAD_EXPIRY', '过期时间无效');
      expiresAt = Date.now() + Math.round(expiresIn) * 1000;
    }
    const id = randomBytes(16).toString('base64url');
    const share = {
      id,
      user,
      paths,
      names,
      types,
      label: label || (paths.length === 1 ? names[0] : `${names[0]} 等 ${paths.length} 项`),
      createdAt: Date.now(),
      expiresAt,
      downloads: 0,
      lastDownloadAt: null,
    };
    this.shares.set(id, share);
    await this.save();
    return share;
  }

  /** Active share or a 404/410 error suitable for public callers. */
  get(id) {
    if (!ShareStore.checkId(id)) throw new HttpError(404, 'NO_SHARE', '链接不存在或已被取消');
    const s = this.shares.get(id);
    if (!s) throw new HttpError(404, 'NO_SHARE', '链接不存在或已被取消');
    if (s.expiresAt && s.expiresAt <= Date.now()) throw new HttpError(410, 'SHARE_EXPIRED', '链接已过期');
    return s;
  }

  list() {
    return [...this.shares.values()].sort((a, b) => b.createdAt - a.createdAt);
  }

  async revoke(ids) {
    let n = 0;
    for (const id of ids) if (this.shares.delete(id)) n++;
    if (n) await this.save();
    return n;
  }

  async update(id, { expiresIn }) {
    const s = this.shares.get(id);
    if (!s) throw new HttpError(404, 'NO_SHARE', '链接不存在');
    if (expiresIn === null) s.expiresAt = null;
    else {
      if (!Number.isFinite(expiresIn) || expiresIn < 60 || expiresIn > MAX_TTL_SEC) throw bad('BAD_EXPIRY', '过期时间无效');
      s.expiresAt = Date.now() + Math.round(expiresIn) * 1000;
    }
    await this.save();
    return s;
  }

  async countDownload(s) {
    s.downloads += 1;
    s.lastDownloadAt = Date.now();
    await this.save();
  }

  /** Keep links working when shared items are renamed or moved. */
  async remap(from, to) {
    let changed = false;
    for (const s of this.shares.values()) {
      s.paths = s.paths.map((p, i) => {
        if (p === from || p.startsWith(`${from}/`)) {
          changed = true;
          const next = to + p.slice(from.length);
          if (p === from) s.names[i] = next.slice(next.lastIndexOf('/') + 1);
          return next;
        }
        return p;
      });
    }
    if (changed) await this.save();
  }

  expire() {
    const now = Date.now();
    let changed = false;
    // keep expired links around for a day so their page can still say "expired"
    for (const [id, s] of this.shares) {
      if (s.expiresAt && s.expiresAt + 86_400_000 < now) {
        this.shares.delete(id);
        changed = true;
      }
    }
    if (changed) this.save();
  }
}
