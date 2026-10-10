import { randomBytes } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { AuthStore } from './auth.mjs';
import { UnifiedIdentityClient } from './identity.mjs';
import { DriveFs } from './fsops.mjs';
import { ShareStore } from './shares.mjs';
import { ThumbCache } from './thumbs.mjs';
import { contentTypeFor, inlineAllowed } from './mime.mjs';
import { HttpError, bad } from './util.mjs';
import { writeZip } from './zip.mjs';

const COOKIE = 'drive_sid';
const JSON_LIMIT = 256 * 1024;

const STATIC_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json',
};

const APP_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data:",
  "media-src 'self' blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "frame-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

// Uploaded files are never allowed to run script in this origin.
const FILE_CSP = "default-src 'none'; img-src 'self' data:; media-src 'self'; style-src 'unsafe-inline'; sandbox";

export function loadConfig(env = process.env) {
  const base = (env.DRIVE_BASE ?? '/drive').replace(/\/+$/, '');
  return {
    identityConfig: env.DRIVE_IDENTITY_CONFIG || '',
    host: env.DRIVE_HOST ?? '127.0.0.1',
    port: Number(env.DRIVE_PORT ?? 4191),
    base,
    dataDir: env.DRIVE_DATA_DIR ?? path.resolve('.local/data'),
    stateDir: env.DRIVE_STATE_DIR ?? path.resolve('.local/state'),
    staticDir: env.DRIVE_STATIC_DIR ?? path.resolve('dist'),
    minFreeBytes: Number(env.DRIVE_MIN_FREE_MB ?? 1536) * 1024 * 1024,
    maxChunk: Number(env.DRIVE_MAX_CHUNK_MB ?? 16) * 1024 * 1024,
    chunkSize: Number(env.DRIVE_CHUNK_MB ?? 8) * 1024 * 1024,
    trashDays: Number(env.DRIVE_TRASH_DAYS ?? 30),
    secureCookie: env.DRIVE_COOKIE_SECURE !== '0',
    trustProxy: env.DRIVE_TRUST_PROXY === '1',
    timeZone: env.DRIVE_TZ ?? 'Asia/Tokyo',
    sessionTtlMs: Number(env.DRIVE_SESSION_HOURS ?? 12) * 3_600_000,
    rememberTtlMs: Number(env.DRIVE_REMEMBER_DAYS ?? 7) * 86_400_000,
  };
}

function parseCookies(header) {
  const out = {};
  for (const part of (header ?? '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function contentDisposition(kind, name) {
  const ascii = name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return `${kind}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

async function readBody(req) {
  const type = req.headers['content-type'] ?? '';
  if (!type.startsWith('application/json')) throw new HttpError(415, 'JSON_REQUIRED', '需要 JSON 请求');
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > JSON_LIMIT) throw new HttpError(413, 'BODY_TOO_LARGE', '请求过大');
    chunks.push(chunk);
  }
  try {
    const v = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
    if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error();
    return v;
  } catch {
    throw bad('BAD_JSON', 'JSON 无效');
  }
}

function sendJson(res, status, value, headers = {}) {
  const body = Buffer.from(JSON.stringify(value));
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': body.length,
    'Cache-Control': 'no-store',
    ...headers,
  });
  res.end(body);
}

function parseRange(header, size) {
  const m = /^bytes=(\d*)-(\d*)$/.exec(header ?? '');
  if (!m || (!m[1] && !m[2])) return null;
  let start;
  let end;
  if (!m[1]) {
    start = Math.max(0, size - Number(m[2]));
    end = size - 1;
  } else {
    start = Number(m[1]);
    end = m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
  }
  if (start > end || start >= size) return 'invalid';
  return { start, end };
}

export async function createApp(config) {
  const auth = config.identityConfig ? new UnifiedIdentityClient(config) : new AuthStore({
    usersFile: path.join(config.stateDir, 'users.json'),
    sessionsFile: path.join(config.stateDir, 'sessions.json'),
    sessionTtlMs: config.sessionTtlMs,
    rememberTtlMs: config.rememberTtlMs,
  });
  const drive = new DriveFs(config);
  await drive.init();
  await auth.load();
  const shares = new ShareStore(path.join(config.stateDir, 'shares.json'));
  await shares.load();
  const thumbs = new ThumbCache(path.join(config.stateDir, 'thumbs'));
  await thumbs.init();
  const zipTokens = new Map();

  const housekeeping = setInterval(() => {
    shares.expire();
    thumbs.prune().catch(() => {});
    drive.trashExpire().catch(() => {});
    drive.uploadExpire().catch(() => {});
    const now = Date.now();
    for (const [k, v] of zipTokens) if (v.expires < now) zipTokens.delete(k);
  }, 3_600_000);
  housekeeping.unref();
  drive.trashExpire().catch(() => {});
  drive.uploadExpire().catch(() => {});

  const clientIp = (req) => {
    if (config.trustProxy) {
      const real = req.headers['x-real-ip'];
      if (typeof real === 'string' && real) return real.slice(0, 64);
    }
    return req.socket.remoteAddress ?? 'unknown';
  };

  const cookieHeader = (token, maxAgeSec) =>
    [
      `${COOKIE}=${token}`,
      `Path=${config.base || '/'}`,
      'HttpOnly',
      'SameSite=Strict',
      config.secureCookie ? 'Secure' : '',
      maxAgeSec != null ? `Max-Age=${maxAgeSec}` : '',
    ]
      .filter(Boolean)
      .join('; ');

  // CSRF: mutating API calls must carry a custom header (forces a CORS preflight that we
  // never approve) and, when present, a same-origin Origin header.
  const checkMutation = (req) => {
    if (req.headers['x-drive-request'] !== '1') throw new HttpError(403, 'CSRF', '请求被拒绝');
    const origin = req.headers.origin;
    if (origin) {
      const host = req.headers['x-forwarded-host'] ?? req.headers.host;
      try {
        if (new URL(origin).host !== host) throw new Error();
      } catch {
        throw new HttpError(403, 'CSRF', '请求来源无效');
      }
    }
  };

  async function sendFile(req, res, raw, download) {
    return sendEntry(req, res, await drive.requireEntry(raw), download);
  }

  async function streamZip(res, entries, name) {
    res.writeHead(200, {
      'Content-Type': 'application/zip',
      'Content-Disposition': contentDisposition('attachment', name),
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    const ac = new AbortController();
    res.on('close', () => ac.abort());
    try {
      await writeZip(res, entries, { timeZone: config.timeZone, signal: ac.signal });
      res.end();
    } catch {
      res.destroy();
    }
  }

  const zipName = (raw) => {
    const name = String(raw ?? '').trim();
    return name ? `${name.replace(/[\\/\u0000-\u001f]/g, '_').slice(0, 120)}.zip` : 'download.zip';
  };

  // ---------- public share links ----------
  async function shareItems(share) {
    const items = [];
    for (const p of share.paths) {
      const e = await drive.requireEntry(p).catch(() => null);
      if (e) items.push(e);
    }
    if (!items.length) throw new HttpError(404, 'SHARE_GONE', '分享的文件已被删除或移动');
    return items;
  }

  const shareUrl = (id) => `${config.base}/s/${id}`;

  async function handlePublicShare(req, res, id, action, url) {
    const share = shares.get(id);
    const items = await shareItems(share);
    if (!action) {
      const described = await Promise.all(
        items.map(async (e) => {
          const d = DriveFs.describe(e.segs.at(-1), e.st);
          if (e.st.isDirectory()) Object.assign(d, await drive.sizeOf(e.abs, 50_000));
          return d;
        }),
      );
      const single = items.length === 1 && items[0].st.isFile();
      return sendJson(res, 200, {
        id: share.id,
        label: share.label,
        createdAt: share.createdAt,
        expiresAt: share.expiresAt,
        kind: single ? 'file' : 'zip',
        items: described,
        total: described.reduce((s, d) => s + (d.type === 'dir' ? (d.bytes ?? 0) : d.size), 0),
      }, { 'Referrer-Policy': 'no-referrer', 'X-Robots-Tag': 'noindex, nofollow' });
    }
    if (action === 'download' || action === 'view') {
      if (items.length === 1 && items[0].st.isFile()) {
        const inline = action === 'view';
        const range = req.headers.range;
        if (!inline && req.method === 'GET' && (!range || /^bytes=0-/.test(range))) shares.countDownload(share).catch(() => {});
        return sendEntry(req, res, items[0], !inline, { public: true });
      }
      if (action === 'view') throw bad('NOT_PREVIEWABLE', '该分享不支持预览');
      const { entries } = await drive.zipEntries(items.map((e) => e.client));
      if (req.method === 'HEAD') {
        res.writeHead(200, { 'Content-Type': 'application/zip' });
        return res.end();
      }
      shares.countDownload(share).catch(() => {});
      return streamZip(res, entries, zipName(share.label));
    }
    return sendJson(res, 404, { error: 'NOT_FOUND' });
  }

  async function sendEntry(req, res, e, download, opts = {}) {
    if (e.st.isDirectory()) throw bad('IS_DIR', '文件夹请使用打包下载');
    const name = e.segs.at(-1);
    const type = contentTypeFor(name);
    const inline = !download && inlineAllowed(type);
    const etag = `"${e.st.size.toString(36)}-${Math.round(e.st.mtimeMs).toString(36)}"`;
    const headers = {
      'Content-Type': inline ? type : type.startsWith('text/') ? type : 'application/octet-stream',
      'Content-Disposition': contentDisposition(inline ? 'inline' : 'attachment', name),
      'Accept-Ranges': 'bytes',
      ETag: etag,
      'Last-Modified': e.st.mtime.toUTCString(),
      'Cache-Control': 'private, no-cache',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'SAMEORIGIN',
      'Cross-Origin-Resource-Policy': 'same-origin',
    };
    if (opts.public) {
      headers['Referrer-Policy'] = 'no-referrer';
      headers['X-Robots-Tag'] = 'noindex, nofollow';
    }
    // Chrome's PDF viewer refuses to run inside a sandboxed document.
    if (type !== 'application/pdf' || !inline) headers['Content-Security-Policy'] = FILE_CSP;
    if (req.headers['if-none-match'] === etag) {
      res.writeHead(304, headers);
      return res.end();
    }
    const size = e.st.size;
    let range = req.headers.range ? parseRange(req.headers.range, size) : null;
    if (range === 'invalid') {
      res.writeHead(416, { 'Content-Range': `bytes */${size}` });
      return res.end();
    }
    if (range && req.headers['if-range'] && req.headers['if-range'] !== etag) range = null;
    if (range) {
      res.writeHead(206, { ...headers, 'Content-Range': `bytes ${range.start}-${range.end}/${size}`, 'Content-Length': range.end - range.start + 1 });
    } else {
      res.writeHead(200, { ...headers, 'Content-Length': size });
    }
    if (req.method === 'HEAD' || size === 0) return res.end();
    const stream = createReadStream(e.abs, range ?? {});
    stream.on('error', () => res.destroy());
    res.on('close', () => stream.destroy());
    stream.pipe(res);
  }

  const routes = {
    'GET /api/session': async ({ session }) => ({ user: session.user }),
    'POST /api/logout': async ({ token, res }) => {
      auth.logout(token);
      res.setHeader('Set-Cookie', cookieHeader('', 0));
      return { ok: true };
    },
    'POST /api/password': async ({ session, body }) => {
      const next = String(body.next ?? '');
      if (next.length < 10) throw bad('WEAK_PASSWORD', '新密码至少 10 个字符');
      const r = await auth.changePassword(session.user, String(body.current ?? ''), next, session.id);
      if (r.error) throw new HttpError(403, r.error, '当前密码不正确');
      return { ok: true };
    },
    'GET /api/status': async () => ({ storage: await drive.usage(), chunkSize: config.chunkSize }),
    'GET /api/list': async ({ query }) => drive.list(query.get('path')),
    'GET /api/search': async ({ query }) => drive.search(query.get('path'), query.get('q')),
    'GET /api/props': async ({ query }) => drive.props(query.get('path')),
    'POST /api/mkdir': async ({ body }) => drive.mkdir(body.path, body.name),
    'POST /api/rename': async ({ body }) => {
      const entry = await drive.rename(body.path, body.name);
      const from = drive.resolve(body.path).client;
      const parent = from.slice(0, from.lastIndexOf('/')) || '';
      await shares.remap(from, `${parent}/${entry.name}`);
      return entry;
    },
    'POST /api/move': async ({ body }) => {
      const r = await drive.move(body.paths, body.dest, body.conflict);
      for (const [from, to] of r.pairs) await shares.remap(from, to);
      return { moved: r.moved };
    },
    'GET /api/shares': async () => {
      const list = await Promise.all(
        shares.list().map(async (s) => ({
          ...s,
          user: undefined,
          url: shareUrl(s.id),
          missing: (await Promise.all(s.paths.map((p) => drive.requireEntry(p).then(() => false, () => true)))).every(Boolean),
        })),
      );
      return { shares: list };
    },
    'POST /api/shares': async ({ session, body }) => {
      if (!Array.isArray(body.paths) || !body.paths.length || body.paths.length > 500) throw bad('BAD_PATHS', '未选择项目');
      const items = [];
      for (const p of body.paths) items.push(await drive.requireEntry(p));
      const share = await shares.create({
        user: session.user,
        paths: items.map((e) => e.client),
        names: items.map((e) => e.segs.at(-1)),
        types: items.map((e) => (e.st.isDirectory() ? 'dir' : 'file')),
        expiresIn: body.expiresIn ?? null,
        label: typeof body.label === 'string' ? body.label.trim().slice(0, 120) : '',
      });
      return { ...share, user: undefined, url: shareUrl(share.id) };
    },
    'POST /api/shares/update': async ({ body }) => {
      const s = await shares.update(String(body.id ?? ''), { expiresIn: body.expiresIn ?? null });
      return { ...s, user: undefined, url: shareUrl(s.id) };
    },
    'POST /api/shares/delete': async ({ body }) => ({ revoked: await shares.revoke(Array.isArray(body.ids) ? body.ids.map(String) : []) }),
    'POST /api/copy': async ({ body }) => drive.copy(body.paths, body.dest, body.conflict),
    'POST /api/delete': async ({ body }) => drive.delete(body.paths, body.permanent === true),
    'GET /api/trash': async () => drive.trashList(),
    'POST /api/trash/restore': async ({ body }) => drive.trashRestore(Array.isArray(body.ids) ? body.ids : []),
    'POST /api/trash/delete': async ({ body }) => {
      await drive.trashPurge(Array.isArray(body.ids) ? body.ids : []);
      return { ok: true };
    },
    'POST /api/trash/empty': async () => drive.trashEmpty(),
    'POST /api/upload/init': async ({ session, body }) =>
      drive.uploadInit(session.user, {
        dir: body.dir,
        relPath: body.relPath,
        size: body.size,
        lastModified: body.lastModified,
        conflict: body.conflict,
      }),
    'POST /api/zip': async ({ session, body }) => {
      const { entries, total } = await drive.zipEntries(body.paths);
      const token = randomBytes(24).toString('base64url');
      zipTokens.set(token, { user: session.user, entries, name: zipName(body.name), expires: Date.now() + 120_000 });
      return { url: `${config.base}/api/zip/${token}`, total, count: entries.length };
    },
  };

  const CONFLICT_MODES = new Set(['fail', 'rename', 'overwrite', 'skip']);

  async function handleApi(req, res, url) {
    const route = url.pathname.slice(config.base.length);
    const method = req.method === 'HEAD' ? 'GET' : req.method;
    const token = parseCookies(req.headers.cookie)[config.identityConfig ? 'chufa_session' : COOKIE];

    const pub = /^\/api\/public\/share\/([^/]+)(?:\/(download|view))?$/.exec(route);
    if (pub) {
      if (method !== 'GET') return sendJson(res, 405, { error: 'METHOD' });
      return handlePublicShare(req, res, pub[1], pub[2], url);
    }

    if (method === 'GET' && route === '/api/auth-mode') return sendJson(res, 200, { unified: !!config.identityConfig });
    if (method !== 'GET') checkMutation(req);

    if (config.identityConfig && ['/api/login','/api/logout','/api/password'].includes(route)) {
      return sendJson(res, 409, { error: 'UNIFIED_ACCOUNT', message: '请在出发网统一账户页面完成登录、退出或修改密码', accountUrl: '/account/?next=/drive/' });
    }

    if (method === 'POST' && route === '/api/login') {
      const body = await readBody(req);
      const r = await auth.login(body.username, body.password, { ip: clientIp(req), remember: body.remember !== false });
      if (r.error === 'RATE_LIMITED') {
        return sendJson(res, 429, { error: r.error, message: `尝试次数过多，请 ${r.retryAfter} 秒后再试` }, { 'Retry-After': String(r.retryAfter) });
      }
      if (r.error) return sendJson(res, 401, { error: r.error, message: '用户名或密码错误' });
      res.setHeader('Set-Cookie', cookieHeader(r.token, r.session.remember ? Math.floor(r.session.ttl / 1000) : undefined));
      return sendJson(res, 200, { user: r.session.user });
    }

    const session = config.identityConfig ? await auth.resolve(token) : auth.touch(token);
    if (!session) return sendJson(res, 401, { error: 'UNAUTHENTICATED', message: '请先登录' });
    if (!config.identityConfig && session.remember && auth.renewed.has(session)) {
      auth.renewed.delete(session);
      // refresh persistent cookie lifetime alongside sliding server expiry
      res.setHeader('Set-Cookie', cookieHeader(token, Math.floor(session.ttl / 1000)));
    }

    if (route === '/api/thumb' && (method === 'GET' || method === 'PUT')) {
      const e = await drive.requireEntry(url.searchParams.get('path'));
      if (!e.st.isFile() || !contentTypeFor(e.segs.at(-1)).startsWith('image/')) throw bad('NOT_IMAGE', '不是图片');
      if (method === 'GET') return thumbs.send(res, e);
      return sendJson(res, 200, await thumbs.store(req, e));
    }

    if (method === 'GET' && route === '/api/file') {
      return sendFile(req, res, url.searchParams.get('path'), url.searchParams.get('dl') === '1');
    }

    let m = /^\/api\/zip\/([A-Za-z0-9_-]{32})$/.exec(route);
    if (m && method === 'GET') {
      const job = zipTokens.get(m[1]);
      zipTokens.delete(m[1]);
      if (!job || job.user !== session.user || job.expires < Date.now()) {
        return sendJson(res, 410, { error: 'EXPIRED', message: '下载链接已失效' });
      }
      return streamZip(res, job.entries, job.name);
    }

    m = /^\/api\/upload\/([a-f0-9]{32})(\/complete)?$/.exec(route);
    if (m) {
      if (method === 'PUT' && !m[2]) {
        const offset = Number(url.searchParams.get('offset'));
        if (!Number.isSafeInteger(offset) || offset < 0) throw bad('BAD_OFFSET', '偏移无效');
        return sendJson(res, 200, await drive.uploadChunk(session.user, m[1], offset, req, config.maxChunk));
      }
      if (method === 'POST' && m[2]) {
        const body = await readBody(req);
        const conflict = CONFLICT_MODES.has(body.conflict) ? body.conflict : 'fail';
        return sendJson(res, 200, await drive.uploadComplete(session.user, m[1], conflict));
      }
      if (method === 'DELETE' && !m[2]) {
        await drive.uploadAbort(session.user, m[1]);
        return sendJson(res, 200, { ok: true });
      }
    }

    const handler = routes[`${method} ${route}`];
    if (!handler) return sendJson(res, 404, { error: 'NOT_FOUND', message: '接口不存在' });
    const body = method === 'POST' ? await readBody(req) : {};
    if ('conflict' in body && !CONFLICT_MODES.has(body.conflict)) body.conflict = 'fail';
    const result = await handler({ req, res, session, token, body, query: url.searchParams });
    return sendJson(res, 200, result);
  }

  let indexHtml = null;
  async function handleStatic(req, res, url) {
    let rel = decodeURIComponent(url.pathname.slice(config.base.length)) || '/';
    if (rel.includes('\0')) throw bad('BAD_PATH');
    const root = path.resolve(config.staticDir);
    let file = path.resolve(root, '.' + path.posix.normalize(rel));
    if (!file.startsWith(root)) throw new HttpError(404, 'NOT_FOUND');
    let st = await stat(file).catch(() => null);
    const isAsset = rel.startsWith('/assets/');
    if (!st || st.isDirectory()) {
      if (isAsset) return sendJson(res, 404, { error: 'NOT_FOUND' });
      // SPA fallback
      indexHtml ??= await readFile(path.join(root, 'index.html')).catch(() => null);
      if (!indexHtml) return sendJson(res, 503, { error: 'NOT_BUILT', message: '前端尚未构建' });
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-cache',
        'Content-Security-Policy': APP_CSP,
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'Referrer-Policy': 'same-origin',
      });
      return res.end(req.method === 'HEAD' ? undefined : indexHtml);
    }
    res.writeHead(200, {
      'Content-Type': STATIC_TYPES[path.extname(file)] ?? 'application/octet-stream',
      'Content-Length': st.size,
      'Cache-Control': isAsset ? 'public, max-age=31536000, immutable' : 'no-cache',
      'X-Content-Type-Options': 'nosniff',
    });
    if (req.method === 'HEAD') return res.end();
    createReadStream(file).pipe(res);
  }

  const server = http.createServer(async (req, res) => {
    const started = Date.now();
    try {
      const url = new URL(req.url, 'http://drive.local');
      if (url.pathname === config.base) {
        res.writeHead(308, { Location: `${config.base}/` });
        return res.end();
      }
      if (!url.pathname.startsWith(`${config.base}/`)) return sendJson(res, 404, { error: 'NOT_FOUND' });
      if (url.pathname.startsWith(`${config.base}/api/`)) await handleApi(req, res, url);
      else if (req.method === 'GET' || req.method === 'HEAD') await handleStatic(req, res, url);
      else sendJson(res, 405, { error: 'METHOD' });
    } catch (e) {
      const status = e instanceof HttpError ? e.status : fsStatus(e);
      if (status === 500) console.error(new Date().toISOString(), req.method, e.code ?? '', e.message);
      if (!res.headersSent) {
        sendJson(res, status, {
          error: e.code ?? 'INTERNAL',
          message: e instanceof HttpError ? e.message : fsMessage(e),
          ...(e.extra ?? {}),
        });
      } else res.destroy();
    } finally {
      if (Date.now() - started > 5000 && !req.url.includes('/api/file') && !req.url.includes('/api/zip/')) {
        console.warn('slow request', req.method, Date.now() - started, 'ms');
      }
    }
  });
  server.requestTimeout = 0; // long downloads/uploads; nginx enforces its own timeouts
  server.headersTimeout = 30_000;
  server.on('close', () => clearInterval(housekeeping));
  return { server, auth, drive, shares, thumbs, config };
}

function fsStatus(e) {
  return { ENOSPC: 507, EACCES: 403, EPERM: 403, ENOTEMPTY: 409, EEXIST: 409, ENOENT: 404, ENOTDIR: 400, ENAMETOOLONG: 400 }[e?.code] ?? 500;
}

function fsMessage(e) {
  switch (e?.code) {
    case 'ENOSPC':
      return '服务器磁盘已满';
    case 'EACCES':
    case 'EPERM':
      return '没有权限';
    case 'ENOTEMPTY':
    case 'EEXIST':
      return '目标已存在';
    case 'ENOENT':
      return '项目不存在';
    default:
      return '服务器内部错误';
  }
}
