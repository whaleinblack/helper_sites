import { createHash, randomBytes } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { cp, lstat, mkdir, readdir, rename, rm, stat, statfs, utimes, open } from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Transform } from 'node:stream';
import { HttpError, bad, readJson, writeJsonAtomic } from './util.mjs';

const MAX_NAME_BYTES = 255;

/** rename(), falling back to copy + delete when source and target sit on different mounts. */
async function moveEntry(src, dst) {
  try {
    await rename(src, dst);
  } catch (e) {
    if (e.code !== 'EXDEV') throw e;
    await cp(src, dst, { recursive: true, errorOnExist: true, force: false, preserveTimestamps: true });
    await rm(src, { recursive: true, force: true });
  }
}
const MAX_DEPTH = 64;

/** Validate a single file/folder name coming from the client. */
export function checkName(raw) {
  if (typeof raw !== 'string') throw bad('BAD_NAME', '名称无效');
  const name = raw.normalize('NFC').trim();
  if (!name || name === '.' || name === '..') throw bad('BAD_NAME', '名称不能为空');
  if (/[\\/\u0000-\u001f\u007f]/.test(name)) throw bad('BAD_NAME', '名称不能包含 / \\ 或控制字符');
  if (Buffer.byteLength(name) > MAX_NAME_BYTES) throw bad('BAD_NAME', '名称过长');
  return name;
}

/** Split a client path ("/a/b") into validated segments. */
export function splitPath(raw) {
  if (raw == null || raw === '') return [];
  if (typeof raw !== 'string') throw bad('BAD_PATH', '路径无效');
  const segs = raw.split('/').filter((s) => s !== '');
  if (segs.length > MAX_DEPTH) throw bad('BAD_PATH', '路径层级过深');
  return segs.map(checkName);
}

export const joinClient = (segs) => '/' + segs.join('/');

export class DriveFs {
  constructor({ dataDir, stateDir, minFreeBytes, trashDays }) {
    this.root = path.resolve(dataDir);
    this.stateDir = path.resolve(stateDir);
    this.trashDir = path.join(this.stateDir, 'trash');
    this.uploadDir = path.join(this.stateDir, 'uploads');
    this.minFreeBytes = minFreeBytes;
    this.trashDays = trashDays;
    this.uploadLocks = new Set();
    this.usageCache = null;
  }

  async init() {
    await mkdir(this.root, { recursive: true, mode: 0o750 });
    await mkdir(this.trashDir, { recursive: true, mode: 0o700 });
    await mkdir(this.uploadDir, { recursive: true, mode: 0o700 });
  }

  abs(segs) {
    const p = path.join(this.root, ...segs);
    if (p !== this.root && !p.startsWith(this.root + path.sep)) throw bad('BAD_PATH', '路径越界');
    return p;
  }

  resolve(raw) {
    const segs = splitPath(raw);
    return { segs, abs: this.abs(segs), client: joinClient(segs) };
  }

  invalidateUsage() {
    this.usageCache = null;
  }

  /** Stat without following symlinks; symlinks are treated as absent. */
  async entryStat(abs) {
    try {
      const st = await lstat(abs);
      if (st.isSymbolicLink()) return null;
      return st;
    } catch (e) {
      if (e.code === 'ENOENT' || e.code === 'ENOTDIR') return null;
      throw e;
    }
  }

  async requireDir(raw) {
    const r = this.resolve(raw);
    const st = await this.entryStat(r.abs);
    if (!st) throw new HttpError(404, 'NOT_FOUND', '文件夹不存在');
    if (!st.isDirectory()) throw bad('NOT_DIR', '不是文件夹');
    return r;
  }

  async requireEntry(raw) {
    const r = this.resolve(raw);
    if (!r.segs.length) throw bad('ROOT', '不能对根目录执行此操作');
    const st = await this.entryStat(r.abs);
    if (!st) throw new HttpError(404, 'NOT_FOUND', `“${r.segs.at(-1)}”不存在`);
    return { ...r, st };
  }

  static describe(name, st) {
    return {
      name,
      type: st.isDirectory() ? 'dir' : 'file',
      size: st.isDirectory() ? 0 : st.size,
      mtime: Math.round(st.mtimeMs),
      ctime: Math.round(st.birthtimeMs || st.ctimeMs),
    };
  }

  async list(raw) {
    const dir = await this.requireDir(raw);
    const dirents = await readdir(dir.abs, { withFileTypes: true });
    const entries = [];
    await Promise.all(
      dirents.map(async (d) => {
        if (d.isSymbolicLink()) return;
        if (!d.isDirectory() && !d.isFile()) return;
        try {
          const st = await lstat(path.join(dir.abs, d.name));
          const e = DriveFs.describe(d.name, st);
          if (st.isDirectory()) {
            try {
              const kids = await readdir(path.join(dir.abs, d.name), { withFileTypes: true });
              e.items = kids.length;
              e.hasDirs = kids.some((k) => k.isDirectory());
            } catch {
              e.items = 0;
            }
          }
          entries.push(e);
        } catch {
          /* vanished between readdir and stat */
        }
      }),
    );
    return { path: dir.client, entries };
  }

  async uniqueName(dirAbs, name) {
    if (!(await this.entryStat(path.join(dirAbs, name)))) return name;
    const dot = name.lastIndexOf('.');
    const hasExt = dot > 0 && name.length - dot <= 10;
    const base = hasExt ? name.slice(0, dot) : name;
    const ext = hasExt ? name.slice(dot) : '';
    for (let i = 2; i < 10000; i++) {
      const candidate = `${base} (${i})${ext}`;
      if (!(await this.entryStat(path.join(dirAbs, candidate)))) return candidate;
    }
    throw new HttpError(409, 'CONFLICT', '无法生成不重复的名称');
  }

  async mkdir(raw, rawName) {
    const dir = await this.requireDir(raw);
    const name = checkName(rawName);
    const target = path.join(dir.abs, name);
    if (await this.entryStat(target)) throw new HttpError(409, 'EXISTS', `“${name}”已存在`);
    await mkdir(target);
    return DriveFs.describe(name, await lstat(target));
  }

  async rename(raw, rawName) {
    const src = await this.requireEntry(raw);
    const name = checkName(rawName);
    if (name === src.segs.at(-1)) return DriveFs.describe(name, src.st);
    const parent = path.dirname(src.abs);
    const target = path.join(parent, name);
    const existing = await this.entryStat(target);
    // allow case-only renames on case-insensitive filesystems
    if (existing && name.toLowerCase() !== src.segs.at(-1).toLowerCase()) {
      throw new HttpError(409, 'EXISTS', `“${name}”已存在`);
    }
    await moveEntry(src.abs, target);
    return DriveFs.describe(name, await lstat(target));
  }

  /** Shared plan for move/copy: validates sources and destination, detects conflicts. */
  async plan(rawPaths, rawDest) {
    if (!Array.isArray(rawPaths) || !rawPaths.length || rawPaths.length > 5000) throw bad('BAD_PATHS', '未选择项目');
    const dest = await this.requireDir(rawDest);
    const items = [];
    const seen = new Set();
    for (const raw of rawPaths) {
      const src = await this.requireEntry(raw);
      if (seen.has(src.client)) continue;
      seen.add(src.client);
      const name = src.segs.at(-1);
      items.push({ ...src, name, target: path.join(dest.abs, name) });
    }
    return { dest, items };
  }

  async resolveConflicts(dest, items, conflict, sameDirOk) {
    const conflicts = [];
    for (const it of items) {
      if (sameDirOk && path.dirname(it.abs) === dest.abs) continue;
      if (await this.entryStat(it.target)) conflicts.push(it.name);
    }
    if (conflicts.length && conflict === 'fail') {
      throw new HttpError(409, 'CONFLICT', '目标位置已有同名项目', { conflicts });
    }
    return new Set(conflicts);
  }

  async move(rawPaths, rawDest, conflict = 'fail') {
    const { dest, items } = await this.plan(rawPaths, rawDest);
    for (const it of items) {
      if (dest.abs === it.abs || dest.abs.startsWith(it.abs + path.sep)) {
        throw bad('INTO_SELF', `不能把“${it.name}”移动到它自身内部`);
      }
    }
    const conflicts = await this.resolveConflicts(dest, items, conflict, true);
    const done = [];
    const pairs = [];
    for (const it of items) {
      if (path.dirname(it.abs) === dest.abs) continue; // already there
      let target = it.target;
      if (conflicts.has(it.name)) {
        if (conflict === 'skip') continue;
        if (conflict === 'rename') target = path.join(dest.abs, await this.uniqueName(dest.abs, it.name));
        if (conflict === 'overwrite') await this.trashAbs(target, joinClient([...dest.segs, it.name]));
      }
      await moveEntry(it.abs, target);
      done.push(path.basename(target));
      pairs.push([it.client, joinClient([...dest.segs, path.basename(target)])]);
    }
    this.invalidateUsage();
    return { moved: done, pairs };
  }

  async copy(rawPaths, rawDest, conflict = 'fail') {
    const { dest, items } = await this.plan(rawPaths, rawDest);
    for (const it of items) {
      if (dest.abs.startsWith(it.abs + path.sep)) throw bad('INTO_SELF', `不能把“${it.name}”复制到它自身内部`);
    }
    let total = 0;
    for (const it of items) total += (await this.sizeOf(it.abs)).bytes;
    await this.ensureSpace(total);
    // copying into the same folder always creates "name (2)" like Explorer
    const conflicts = await this.resolveConflicts(dest, items, conflict, false);
    const done = [];
    for (const it of items) {
      let target = it.target;
      const sameDir = path.dirname(it.abs) === dest.abs;
      if (sameDir || conflicts.has(it.name)) {
        if (!sameDir && conflict === 'skip') continue;
        if (sameDir || conflict === 'rename') target = path.join(dest.abs, await this.uniqueName(dest.abs, it.name));
        else if (conflict === 'overwrite') await this.trashAbs(target, joinClient([...dest.segs, it.name]));
      }
      await cp(it.abs, target, { recursive: true, errorOnExist: true, force: false, preserveTimestamps: true, verbatimSymlinks: true, filter: async (s) => !(await lstat(s)).isSymbolicLink() });
      done.push(path.basename(target));
    }
    this.invalidateUsage();
    return { copied: done };
  }

  // ---------- recycle bin ----------
  async trashAbs(abs, clientPath) {
    const id = `${Date.now().toString(36)}-${randomBytes(5).toString('hex')}`;
    const holder = path.join(this.trashDir, id);
    await mkdir(holder, { mode: 0o700 });
    const st = await lstat(abs);
    const name = path.basename(abs);
    const { bytes } = await this.sizeOf(abs);
    await moveEntry(abs, path.join(holder, name));
    await writeJsonAtomic(path.join(this.trashDir, `${id}.json`), {
      id,
      name,
      original: clientPath,
      type: st.isDirectory() ? 'dir' : 'file',
      size: bytes,
      mtime: Math.round(st.mtimeMs),
      deletedAt: Date.now(),
    });
    return id;
  }

  async delete(rawPaths, permanent = false) {
    if (!Array.isArray(rawPaths) || !rawPaths.length || rawPaths.length > 5000) throw bad('BAD_PATHS', '未选择项目');
    const targets = [];
    for (const raw of rawPaths) targets.push(await this.requireEntry(raw));
    const trashIds = [];
    for (const t of targets) {
      if (!(await this.entryStat(t.abs))) continue; // already removed as part of a parent
      if (permanent) await rm(t.abs, { recursive: true, force: true });
      else trashIds.push(await this.trashAbs(t.abs, t.client));
    }
    this.invalidateUsage();
    return { deleted: targets.length, trashIds };
  }

  async trashList() {
    const files = await readdir(this.trashDir);
    const items = [];
    for (const f of files) {
      if (!f.endsWith('.json')) continue;
      const meta = await readJson(path.join(this.trashDir, f), null);
      if (meta) items.push(meta);
    }
    items.sort((a, b) => b.deletedAt - a.deletedAt);
    return { items, retentionDays: this.trashDays };
  }

  trashId(id) {
    if (typeof id !== 'string' || !/^[a-z0-9]+-[a-f0-9]{10}$/.test(id)) throw bad('BAD_ID', '回收站项目无效');
    return id;
  }

  async trashPurge(ids) {
    for (const raw of ids) {
      const id = this.trashId(raw);
      await rm(path.join(this.trashDir, id), { recursive: true, force: true });
      await rm(path.join(this.trashDir, `${id}.json`), { force: true });
    }
    this.invalidateUsage();
  }

  async trashEmpty() {
    const { items } = await this.trashList();
    await this.trashPurge(items.map((i) => i.id));
    return { purged: items.length };
  }

  async trashRestore(ids) {
    const restored = [];
    for (const raw of ids) {
      const id = this.trashId(raw);
      const meta = await readJson(path.join(this.trashDir, `${id}.json`), null);
      if (!meta) continue;
      const segs = splitPath(meta.original);
      const parentSegs = segs.slice(0, -1);
      let parentAbs = this.root;
      for (const s of parentSegs) {
        parentAbs = path.join(parentAbs, s);
        const st = await this.entryStat(parentAbs);
        if (!st) await mkdir(parentAbs);
        else if (!st.isDirectory()) throw new HttpError(409, 'CONFLICT', `无法还原：${s} 不是文件夹`);
      }
      const name = await this.uniqueName(parentAbs, meta.name);
      await moveEntry(path.join(this.trashDir, id, meta.name), path.join(parentAbs, name));
      await rm(path.join(this.trashDir, id), { recursive: true, force: true });
      await rm(path.join(this.trashDir, `${id}.json`), { force: true });
      restored.push(joinClient([...parentSegs, name]));
    }
    this.invalidateUsage();
    return { restored };
  }

  async trashExpire() {
    const cutoff = Date.now() - this.trashDays * 86_400_000;
    const { items } = await this.trashList();
    const old = items.filter((i) => i.deletedAt < cutoff).map((i) => i.id);
    if (old.length) await this.trashPurge(old);
  }

  // ---------- sizes & space ----------
  async sizeOf(abs, limit = 200_000) {
    let bytes = 0;
    let files = 0;
    let dirs = 0;
    let visited = 0;
    const walk = async (p) => {
      if (++visited > limit) return;
      const st = await lstat(p).catch(() => null);
      if (!st || st.isSymbolicLink()) return;
      if (st.isDirectory()) {
        dirs++;
        const kids = await readdir(p).catch(() => []);
        for (const k of kids) await walk(path.join(p, k));
      } else if (st.isFile()) {
        files++;
        bytes += st.size;
      }
    };
    await walk(abs);
    return { bytes, files, dirs: Math.max(0, dirs - 1), truncated: visited > limit };
  }

  async props(raw) {
    const r = this.resolve(raw);
    const st = await this.entryStat(r.abs);
    if (!st) throw new HttpError(404, 'NOT_FOUND', '项目不存在');
    const base = DriveFs.describe(r.segs.at(-1) ?? '我的网盘', st);
    if (st.isDirectory()) Object.assign(base, await this.sizeOf(r.abs));
    return { path: r.client, ...base, atime: Math.round(st.atimeMs) };
  }

  async usage() {
    const now = Date.now();
    if (!this.usageCache || now - this.usageCache.at > 60_000) {
      const [data, trash] = await Promise.all([this.sizeOf(this.root), this.sizeOf(this.trashDir)]);
      this.usageCache = { at: now, used: data.bytes, trash: trash.bytes };
    }
    const fsInfo = await statfs(this.root);
    const total = fsInfo.blocks * fsInfo.bsize;
    const free = fsInfo.bavail * fsInfo.bsize;
    return {
      used: this.usageCache.used,
      trash: this.usageCache.trash,
      diskTotal: total,
      diskFree: free,
      reserve: this.minFreeBytes,
      available: Math.max(0, free - this.minFreeBytes),
    };
  }

  async ensureSpace(bytes) {
    const fsInfo = await statfs(this.root);
    const free = fsInfo.bavail * fsInfo.bsize;
    if (free - bytes < this.minFreeBytes) {
      throw new HttpError(507, 'NO_SPACE', `服务器空间不足：可用约 ${fmtBytes(Math.max(0, free - this.minFreeBytes))}`);
    }
  }

  // ---------- search ----------
  async search(raw, q, max = 500) {
    const dir = await this.requireDir(raw);
    const needle = String(q ?? '').trim().toLowerCase();
    if (!needle) return { path: dir.client, entries: [] };
    const results = [];
    let visited = 0;
    const walk = async (abs, segs) => {
      if (results.length >= max || ++visited > 100_000) return;
      const dirents = await readdir(abs, { withFileTypes: true }).catch(() => []);
      for (const d of dirents) {
        if (results.length >= max) return;
        if (d.isSymbolicLink() || (!d.isDirectory() && !d.isFile())) continue;
        const childAbs = path.join(abs, d.name);
        if (d.name.toLowerCase().includes(needle)) {
          const st = await lstat(childAbs).catch(() => null);
          if (st) results.push({ ...DriveFs.describe(d.name, st), parent: joinClient(segs) });
        }
        if (d.isDirectory()) await walk(childAbs, [...segs, d.name]);
      }
    };
    await walk(dir.abs, dir.segs);
    return { path: dir.client, entries: results, truncated: results.length >= max };
  }

  // ---------- zip planning ----------
  async zipEntries(rawPaths) {
    if (!Array.isArray(rawPaths) || !rawPaths.length) throw bad('BAD_PATHS', '未选择项目');
    const out = [];
    let total = 0;
    const walk = async (abs, rel) => {
      const st = await lstat(abs).catch(() => null);
      if (!st || st.isSymbolicLink()) return;
      if (st.isDirectory()) {
        out.push({ name: `${rel}/`, type: 'dir', mtime: st.mtimeMs });
        const kids = (await readdir(abs)).sort();
        for (const k of kids) await walk(path.join(abs, k), `${rel}/${k}`);
      } else if (st.isFile()) {
        out.push({ name: rel, type: 'file', abs, size: st.size, mtime: st.mtimeMs });
        total += st.size;
      }
      if (out.length > 100_000) throw bad('TOO_MANY', '文件数量过多，无法打包');
    };
    const names = new Set();
    for (const raw of rawPaths) {
      const e = await this.requireEntry(raw);
      let name = e.segs.at(-1);
      for (let i = 2; names.has(name.toLowerCase()); i++) name = `${e.segs.at(-1)} (${i})`;
      names.add(name.toLowerCase());
      await walk(e.abs, name);
    }
    return { entries: out, total };
  }

  // ---------- chunked, resumable uploads ----------
  uploadKey(user, dirClient, rel, size, lastModified) {
    return createHash('sha256').update(JSON.stringify([user, dirClient, rel, size, lastModified])).digest('hex').slice(0, 32);
  }

  uploadFiles(id) {
    if (!/^[a-f0-9]{32}$/.test(id)) throw bad('BAD_UPLOAD', '上传任务无效');
    return { meta: path.join(this.uploadDir, `${id}.json`), part: path.join(this.uploadDir, `${id}.part`) };
  }

  async uploadInit(user, { dir: rawDir, relPath, size, lastModified, conflict = 'fail' }) {
    const dir = await this.requireDir(rawDir);
    const relSegs = splitPath(relPath);
    if (!relSegs.length) throw bad('BAD_NAME', '缺少文件名');
    if (!Number.isSafeInteger(size) || size < 0) throw bad('BAD_SIZE', '文件大小无效');
    const lm = Number.isFinite(lastModified) ? Math.round(lastModified) : Date.now();
    const target = this.abs([...dir.segs, ...relSegs]);
    const existing = await this.entryStat(target);
    if (existing && conflict === 'fail') {
      throw new HttpError(409, 'CONFLICT', `“${relSegs.join('/')}”已存在`, { conflicts: [relSegs.join('/')] });
    }
    if (existing && conflict === 'skip') return { skipped: true };
    const id = this.uploadKey(user, dir.client, relSegs.join('/'), size, lm);
    const f = this.uploadFiles(id);
    let offset = 0;
    const prior = await readJson(f.meta, null);
    if (prior) {
      offset = (await stat(f.part).catch(() => ({ size: 0 }))).size;
    } else {
      await this.ensureSpace(size);
      await writeJsonAtomic(f.meta, { id, user, dir: dir.client, rel: relSegs, size, lastModified: lm, created: Date.now() });
      await (await open(f.part, 'w', 0o600)).close();
    }
    if (offset > size) offset = 0;
    return { id, offset };
  }

  async uploadChunk(user, id, offset, req, maxChunk) {
    const f = this.uploadFiles(id);
    const meta = await readJson(f.meta, null);
    if (!meta || meta.user !== user) throw new HttpError(404, 'NO_UPLOAD', '上传任务不存在或已过期');
    if (this.uploadLocks.has(id)) throw new HttpError(409, 'BUSY', '该文件正在上传');
    this.uploadLocks.add(id);
    try {
      const current = (await stat(f.part)).size;
      if (offset !== current) throw new HttpError(409, 'OFFSET', '上传偏移不一致', { offset: current });
      const declared = Number(req.headers['content-length']);
      if (!Number.isFinite(declared) || declared > maxChunk) throw new HttpError(413, 'CHUNK_TOO_LARGE', '分片过大');
      if (current + declared > meta.size) throw bad('OVERFLOW', '数据超出文件大小');
      await this.ensureSpace(declared);
      let received = 0;
      const counter = new Transform({
        transform(chunk, _enc, cb) {
          received += chunk.length;
          if (received > declared) cb(new HttpError(413, 'CHUNK_TOO_LARGE', '分片过大'));
          else cb(null, chunk);
        },
      });
      try {
        await pipeline(req, counter, createWriteStream(f.part, { flags: 'a' }));
      } catch (e) {
        // keep only whole bytes that landed; client resumes from reported offset
        throw e instanceof HttpError ? e : new HttpError(400, 'INTERRUPTED', '分片传输中断', { offset: (await stat(f.part)).size });
      }
      return { offset: (await stat(f.part)).size };
    } finally {
      this.uploadLocks.delete(id);
    }
  }

  async uploadComplete(user, id, conflict = 'fail') {
    const f = this.uploadFiles(id);
    const meta = await readJson(f.meta, null);
    if (!meta || meta.user !== user) throw new HttpError(404, 'NO_UPLOAD', '上传任务不存在或已过期');
    const size = (await stat(f.part)).size;
    if (size !== meta.size) throw new HttpError(409, 'INCOMPLETE', '文件尚未传完', { offset: size });
    const dir = await this.requireDir(meta.dir).catch(() => {
      throw new HttpError(409, 'DIR_GONE', '目标文件夹已不存在');
    });
    // create intermediate folders for folder uploads
    let parentAbs = dir.abs;
    for (const s of meta.rel.slice(0, -1)) {
      parentAbs = path.join(parentAbs, s);
      const st = await this.entryStat(parentAbs);
      if (!st) await mkdir(parentAbs).catch((e) => { if (e.code !== 'EEXIST') throw e; });
      else if (!st.isDirectory()) throw new HttpError(409, 'CONFLICT', `“${s}”是文件，无法作为文件夹`);
    }
    let name = meta.rel.at(-1);
    const target = path.join(parentAbs, name);
    const existing = await this.entryStat(target);
    if (existing) {
      if (conflict === 'fail') throw new HttpError(409, 'CONFLICT', `“${name}”已存在`, { conflicts: [name] });
      if (conflict === 'rename') name = await this.uniqueName(parentAbs, name);
      else if (conflict === 'overwrite') {
        if (existing.isDirectory()) throw new HttpError(409, 'CONFLICT', `“${name}”是文件夹，不能被文件覆盖`);
        await this.trashAbs(target, joinClient([...splitPath(meta.dir), ...meta.rel]));
      } else if (conflict === 'skip') {
        await this.uploadAbort(user, id);
        return { skipped: true };
      }
    }
    const finalAbs = path.join(parentAbs, name);
    await moveEntry(f.part, finalAbs);
    const when = new Date(meta.lastModified);
    await utimes(finalAbs, when, when).catch(() => {});
    await rm(f.meta, { force: true });
    this.invalidateUsage();
    return { entry: DriveFs.describe(name, await lstat(finalAbs)) };
  }

  async uploadAbort(user, id) {
    const f = this.uploadFiles(id);
    const meta = await readJson(f.meta, null);
    if (!meta || meta.user !== user) return;
    await rm(f.part, { force: true });
    await rm(f.meta, { force: true });
  }

  async uploadExpire(maxAgeMs = 3 * 86_400_000) {
    const files = await readdir(this.uploadDir).catch(() => []);
    const now = Date.now();
    for (const file of files) {
      const full = path.join(this.uploadDir, file);
      const st = await stat(full).catch(() => null);
      if (st && now - st.mtimeMs > maxAgeMs) await rm(full, { force: true });
    }
  }
}

export function fmtBytes(n) {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(i ? 1 : 0)} ${units[i]}`;
}
