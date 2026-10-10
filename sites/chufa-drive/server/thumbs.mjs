import { createHash, randomBytes } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { HttpError, bad } from './util.mjs';

const MAX_THUMB_BYTES = 512 * 1024;
const MAX_CACHE_BYTES = 256 * 1024 * 1024;
const TYPES = { 'image/webp': '.webp', 'image/jpeg': '.jpg', 'image/png': '.png' };

/**
 * Small preview images for photos. The browser renders them (off the main thread) the first
 * time it meets a large image and uploads the result; everyone then loads the ~20 KB version
 * instead of decoding a multi-megapixel original for a 96 px icon. Keys include the file's
 * size and mtime, so edits naturally invalidate old thumbnails.
 */
export class ThumbCache {
  constructor(dir) {
    this.dir = dir;
  }

  async init() {
    await mkdir(this.dir, { recursive: true, mode: 0o700 });
  }

  key(entry) {
    return createHash('sha1').update(`${entry.client}\0${entry.st.size}\0${Math.round(entry.st.mtimeMs)}`).digest('hex');
  }

  async find(entry) {
    const k = this.key(entry);
    for (const [type, ext] of Object.entries(TYPES)) {
      const file = path.join(this.dir, k + ext);
      const st = await stat(file).catch(() => null);
      if (st) return { file, type, size: st.size };
    }
    return null;
  }

  async send(res, entry) {
    const hit = await this.find(entry);
    if (!hit) throw new HttpError(404, 'NO_THUMB', '缩略图尚未生成');
    res.writeHead(200, {
      'Content-Type': hit.type,
      'Content-Length': hit.size,
      // the URL carries the file version, so the response never changes
      'Cache-Control': 'private, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
      'Cross-Origin-Resource-Policy': 'same-origin',
    });
    createReadStream(hit.file).pipe(res);
  }

  async store(req, entry) {
    const type = String(req.headers['content-type'] ?? '').split(';')[0].trim();
    const ext = TYPES[type];
    if (!ext) throw new HttpError(415, 'BAD_TYPE', '缩略图格式无效');
    const declared = Number(req.headers['content-length']);
    if (!Number.isFinite(declared) || declared <= 0 || declared > MAX_THUMB_BYTES) throw new HttpError(413, 'TOO_LARGE', '缩略图过大');
    const chunks = [];
    let size = 0;
    for await (const c of req) {
      size += c.length;
      if (size > MAX_THUMB_BYTES) throw new HttpError(413, 'TOO_LARGE', '缩略图过大');
      chunks.push(c);
    }
    const buf = Buffer.concat(chunks);
    // cheap magic-number check so only real images are cached
    const ok =
      (ext === '.webp' && buf.subarray(0, 4).toString() === 'RIFF' && buf.subarray(8, 12).toString() === 'WEBP') ||
      (ext === '.jpg' && buf[0] === 0xff && buf[1] === 0xd8) ||
      (ext === '.png' && buf.subarray(1, 4).toString() === 'PNG');
    if (!ok) throw bad('BAD_IMAGE', '缩略图数据无效');
    const k = this.key(entry);
    const tmp = path.join(this.dir, `${k}.${randomBytes(4).toString('hex')}.tmp`);
    await writeFile(tmp, buf, { mode: 0o600 });
    await rename(tmp, path.join(this.dir, k + ext));
    return { ok: true };
  }

  /** Keep the cache bounded: drop the oldest thumbnails beyond MAX_CACHE_BYTES. */
  async prune() {
    const names = await readdir(this.dir).catch(() => []);
    const files = [];
    let total = 0;
    for (const n of names) {
      const full = path.join(this.dir, n);
      const st = await stat(full).catch(() => null);
      if (!st) continue;
      if (n.endsWith('.tmp')) {
        if (Date.now() - st.mtimeMs > 3_600_000) await rm(full, { force: true });
        continue;
      }
      files.push({ full, size: st.size, at: st.mtimeMs });
      total += st.size;
    }
    files.sort((a, b) => a.at - b.at);
    for (const f of files) {
      if (total <= MAX_CACHE_BYTES) break;
      await rm(f.full, { force: true });
      total -= f.size;
    }
  }
}
