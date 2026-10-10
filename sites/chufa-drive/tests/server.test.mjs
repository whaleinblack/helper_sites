import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { hashPassword } from '../server/auth.mjs';
import { createApp, loadConfig } from '../server/app.mjs';

let base;
let tmp;
let app;
let cookie = '';

const H = { 'x-drive-request': '1', 'content-type': 'application/json' };

async function api(method, route, body, headers = {}) {
  const res = await fetch(`${base}${route}`, {
    method,
    headers: { ...H, cookie, ...headers },
    body: body === undefined ? undefined : typeof body === 'string' || body instanceof Uint8Array ? body : JSON.stringify(body),
  });
  const type = res.headers.get('content-type') ?? '';
  const data = type.includes('json') ? await res.json() : Buffer.from(await res.arrayBuffer());
  return { status: res.status, data, headers: res.headers };
}

async function upload(dir, relPath, content, conflict = 'fail') {
  const buf = Buffer.from(content);
  const init = await api('POST', '/api/upload/init', { dir, relPath, size: buf.length, lastModified: 1700000000000, conflict });
  if (init.status !== 200) return init;
  if (init.data.skipped) return init;
  const half = Math.floor(buf.length / 2);
  for (const [start, end] of [[0, half], [half, buf.length]]) {
    if (end === start) continue;
    const r = await api('PUT', `/api/upload/${init.data.id}?offset=${start}`, buf.subarray(start, end), { 'content-type': 'application/octet-stream' });
    assert.equal(r.status, 200, JSON.stringify(r.data));
  }
  return api('POST', `/api/upload/${init.data.id}/complete`, { conflict });
}

before(async () => {
  tmp = await mkdtemp(path.join(os.tmpdir(), 'drive-test-'));
  const config = loadConfig({
    DRIVE_DATA_DIR: path.join(tmp, 'data'),
    DRIVE_STATE_DIR: path.join(tmp, 'state'),
    DRIVE_STATIC_DIR: path.join(tmp, 'dist'),
    DRIVE_COOKIE_SECURE: '0',
    DRIVE_MIN_FREE_MB: '1',
    DRIVE_MAX_CHUNK_MB: '1',
  });
  await mkdir(config.stateDir, { recursive: true });
  await writeFile(path.join(config.stateDir, 'users.json'), JSON.stringify({ users: { alice: await hashPassword('correct horse battery') } }));
  app = await createApp(config);
  await new Promise((r) => app.server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${app.server.address().port}/drive`;
});

after(async () => {
  app.server.close();
  await rm(tmp, { recursive: true, force: true });
});

test('rejects unauthenticated and forged requests', async () => {
  assert.equal((await api('GET', '/api/list')).status, 401);
  const noHeader = await fetch(`${base}/api/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  assert.equal(noHeader.status, 403);
  const crossOrigin = await api('POST', '/api/login', { username: 'alice', password: 'x' }, { origin: 'https://evil.example' });
  assert.equal(crossOrigin.status, 403);
  const wrong = await api('POST', '/api/login', { username: 'alice', password: 'nope' });
  assert.equal(wrong.status, 401);
});

test('logs in and sets a scoped HttpOnly cookie', async () => {
  const r = await api('POST', '/api/login', { username: 'Alice', password: 'correct horse battery', remember: true });
  assert.equal(r.status, 200);
  const set = r.headers.get('set-cookie');
  assert.match(set, /HttpOnly/);
  assert.match(set, /Path=\/drive/);
  assert.match(set, /SameSite=Strict/);
  cookie = set.split(';')[0];
  assert.equal((await api('GET', '/api/session')).data.user, 'alice');
});

test('blocks path traversal and bad names', async () => {
  for (const p of ['/../etc', '/a/../../x', '..']) {
    assert.equal((await api('GET', `/api/list?path=${encodeURIComponent(p)}`)).status, 400);
  }
  assert.equal((await api('POST', '/api/mkdir', { path: '/', name: 'a/b' })).status, 400);
  assert.equal((await api('POST', '/api/mkdir', { path: '/', name: '..' })).status, 400);
});

test('folders, chunked upload, listing and ranged download', async () => {
  assert.equal((await api('POST', '/api/mkdir', { path: '/', name: '工作资料' })).status, 200);
  assert.equal((await api('POST', '/api/mkdir', { path: '/', name: '工作资料' })).status, 409);
  const up = await upload('/工作资料', '报告.txt', 'hello drive 你好');
  assert.equal(up.status, 200, JSON.stringify(up.data));
  const nested = await upload('/工作资料', 'sub/deep/a.txt', 'nested');
  assert.equal(nested.status, 200);
  const list = await api('GET', `/api/list?path=${encodeURIComponent('/工作资料')}`);
  const names = list.data.entries.map((e) => e.name).sort();
  assert.deepEqual(names, ['sub', '报告.txt']);
  const file = list.data.entries.find((e) => e.name === '报告.txt');
  assert.equal(file.mtime, 1700000000000);

  const dl = await api('GET', `/api/file?path=${encodeURIComponent('/工作资料/报告.txt')}`);
  assert.equal(dl.data.toString(), 'hello drive 你好');
  assert.match(dl.headers.get('content-security-policy'), /sandbox/);
  const part = await api('GET', `/api/file?path=${encodeURIComponent('/工作资料/报告.txt')}`, undefined, { range: 'bytes=0-4' });
  assert.equal(part.status, 206);
  assert.equal(part.data.toString(), 'hello');
  const att = await api('GET', `/api/file?path=${encodeURIComponent('/工作资料/报告.txt')}&dl=1`);
  assert.match(att.headers.get('content-disposition'), /^attachment/);
});

test('upload conflicts: fail, rename, overwrite (old copy goes to trash)', async () => {
  const dup = await upload('/工作资料', '报告.txt', 'second');
  assert.equal(dup.status, 409);
  assert.deepEqual(dup.data.conflicts, ['报告.txt']);
  const renamed = await upload('/工作资料', '报告.txt', 'second', 'rename');
  assert.equal(renamed.data.entry.name, '报告 (2).txt');
  const over = await upload('/工作资料', '报告.txt', 'third', 'overwrite');
  assert.equal(over.status, 200);
  const trash = await api('GET', '/api/trash');
  assert.ok(trash.data.items.some((i) => i.original === '/工作资料/报告.txt'));
});

test('rejects oversized or misaligned chunks', async () => {
  const init = await api('POST', '/api/upload/init', { dir: '/', relPath: 'big.bin', size: 10, lastModified: 1 });
  const wrongOffset = await api('PUT', `/api/upload/${init.data.id}?offset=5`, Buffer.alloc(5), { 'content-type': 'application/octet-stream' });
  assert.equal(wrongOffset.status, 409);
  assert.equal(wrongOffset.data.offset, 0);
  const overflow = await api('PUT', `/api/upload/${init.data.id}?offset=0`, Buffer.alloc(11), { 'content-type': 'application/octet-stream' });
  assert.equal(overflow.status, 400);
  const early = await api('POST', `/api/upload/${init.data.id}/complete`, {});
  assert.equal(early.status, 409);
  await api('DELETE', `/api/upload/${init.data.id}`);
});

test('rename, copy, move and delete/restore via trash', async () => {
  assert.equal((await api('POST', '/api/rename', { path: '/工作资料/sub', name: 'renamed' })).status, 200);
  const copy = await api('POST', '/api/copy', { paths: ['/工作资料/renamed'], dest: '/' });
  assert.deepEqual(copy.data.copied, ['renamed']);
  const again = await api('POST', '/api/copy', { paths: ['/工作资料/renamed'], dest: '/' });
  assert.equal(again.status, 409);
  const keepBoth = await api('POST', '/api/copy', { paths: ['/工作资料/renamed'], dest: '/', conflict: 'rename' });
  assert.deepEqual(keepBoth.data.copied, ['renamed (2)']);
  assert.equal((await api('POST', '/api/move', { paths: ['/工作资料'], dest: '/工作资料/renamed' })).status, 400);
  const moved = await api('POST', '/api/move', { paths: ['/renamed (2)'], dest: '/工作资料' });
  assert.deepEqual(moved.data.moved, ['renamed (2)']);

  assert.equal((await api('POST', '/api/delete', { paths: ['/renamed'] })).status, 200);
  assert.equal((await api('GET', '/api/list?path=/renamed')).status, 404);
  const trash = await api('GET', '/api/trash');
  const item = trash.data.items.find((i) => i.original === '/renamed');
  const restored = await api('POST', '/api/trash/restore', { ids: [item.id] });
  assert.deepEqual(restored.data.restored, ['/renamed']);
  assert.equal((await api('GET', '/api/list?path=/renamed')).status, 200);
});

test('search and properties', async () => {
  const s = await api('GET', `/api/search?path=/&q=${encodeURIComponent('A.TXT')}`);
  assert.ok(s.data.entries.length >= 2);
  const p = await api('GET', `/api/props?path=${encodeURIComponent('/工作资料')}`);
  assert.ok(p.data.files >= 3);
});

test('zip download produces a valid archive', async () => {
  const z = await api('POST', '/api/zip', { paths: ['/工作资料', '/renamed'], name: '打包' });
  assert.equal(z.status, 200);
  const route = z.data.url.replace(/^\/drive/, '');
  const res = await api('GET', route);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-disposition'), /filename\*=UTF-8''%E6%89%93%E5%8C%85\.zip/);
  const zipFile = path.join(tmp, 'out.zip');
  await writeFile(zipFile, res.data);
  const outDir = path.join(tmp, 'unzipped');
  await mkdir(outDir);
  // bsdtar reads ZIP (Windows ships it); elsewhere fall back to unzip.
  if (process.platform === 'win32') execFileSync(path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe'), ['-xf', zipFile], { cwd: outDir });
  else execFileSync('unzip', ['-q', zipFile], { cwd: outDir });
  assert.equal(await readFile(path.join(outDir, '工作资料', '报告.txt'), 'utf8'), 'third');
  assert.equal(await readFile(path.join(outDir, 'renamed', 'deep', 'a.txt'), 'utf8'), 'nested');
  assert.equal((await api('GET', route)).status, 410, 'token is single use');
});

test('password change requires the current password', async () => {
  assert.equal((await api('POST', '/api/password', { current: 'bad', next: 'another long password' })).status, 403);
  assert.equal((await api('POST', '/api/password', { current: 'correct horse battery', next: 'short' })).status, 400);
});

test('login rate limiting kicks in', async () => {
  let last;
  for (let i = 0; i < 14; i++) last = await api('POST', '/api/login', { username: 'bob', password: 'x' }, { cookie: '' });
  assert.equal(last.status, 429);
});

test('share links: public download, rename-follow, zip, expiry and revoke', async () => {
  await upload('/', 'share-me.txt', 'shared content');
  const created = await api('POST', '/api/shares', { paths: ['/share-me.txt'], expiresIn: 3600 });
  assert.equal(created.status, 200, JSON.stringify(created.data));
  assert.match(created.data.url, /^\/drive\/s\/[A-Za-z0-9_-]{22}$/);
  const id = created.data.id;
  assert.ok(created.data.expiresAt > Date.now());

  // anonymous access (no cookie)
  const anon = (route, headers = {}) => api('GET', route, undefined, { cookie: '', ...headers });
  const meta = await anon(`/api/public/share/${id}`);
  assert.equal(meta.status, 200);
  assert.equal(meta.data.kind, 'file');
  assert.equal(meta.data.items[0].name, 'share-me.txt');
  assert.equal(meta.data.paths, undefined, 'internal paths are not exposed');
  const dl = await anon(`/api/public/share/${id}/download`);
  assert.equal(dl.data.toString(), 'shared content');
  assert.match(dl.headers.get('content-disposition'), /^attachment/);
  assert.match(dl.headers.get('content-security-policy'), /sandbox/);
  assert.equal((await anon(`/api/public/share/${id}/view`)).headers.get('content-disposition').split(';')[0], 'inline');
  assert.equal((await api('POST', `/api/public/share/${id}`, {}, { cookie: '' })).status, 405);

  // renaming the file keeps the link alive
  await api('POST', '/api/rename', { path: '/share-me.txt', name: 'renamed-share.txt' });
  assert.equal((await anon(`/api/public/share/${id}`)).data.items[0].name, 'renamed-share.txt');
  const list = await api('GET', '/api/shares');
  const mine = list.data.shares.find((s) => s.id === id);
  assert.equal(mine.downloads, 1);
  assert.equal(mine.missing, false);

  // folder share downloads as zip
  const folder = await api('POST', '/api/shares', { paths: ['/工作资料'], expiresIn: null });
  assert.equal(folder.data.expiresAt, null);
  const fmeta = await anon(`/api/public/share/${folder.data.id}`);
  assert.equal(fmeta.data.kind, 'zip');
  const zip = await anon(`/api/public/share/${folder.data.id}/download`);
  assert.equal(zip.headers.get('content-type'), 'application/zip');
  assert.equal(zip.data.subarray(0, 4).toString('hex'), '504b0304');

  // expiry and revocation
  assert.equal((await api('POST', '/api/shares', { paths: ['/renamed-share.txt'], expiresIn: 5 })).status, 400);
  app.shares.shares.get(id).expiresAt = Date.now() - 1000;
  assert.equal((await anon(`/api/public/share/${id}/download`)).status, 410);
  await api('POST', '/api/shares/update', { id, expiresIn: 86400 });
  assert.equal((await anon(`/api/public/share/${id}/download`)).status, 200);
  await api('POST', '/api/shares/delete', { ids: [id] });
  assert.equal((await anon(`/api/public/share/${id}`)).status, 404);
  assert.equal((await anon('/api/public/share/not-a-real-token')).status, 404);
  // deleted target
  await api('POST', '/api/delete', { paths: ['/renamed-share.txt'], permanent: true });
  const gone = await api('POST', '/api/shares', { paths: ['/工作资料/报告.txt'] });
  await api('POST', '/api/delete', { paths: ['/工作资料/报告.txt'], permanent: true });
  assert.equal((await anon(`/api/public/share/${gone.data.id}`)).status, 404);
});

test('thumbnail cache: store, serve, validate and invalidate on change', async () => {
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64)]);
  await upload('/', 'photo.png', png);
  const q = `/api/thumb?path=${encodeURIComponent('/photo.png')}`;
  assert.equal((await api('GET', q)).status, 404);
  const webp = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBPVP8 '), Buffer.alloc(20)]);
  const put = await api('PUT', q, webp, { 'content-type': 'image/webp' });
  assert.equal(put.status, 200, JSON.stringify(put.data));
  const got = await api('GET', q);
  assert.equal(got.status, 200);
  assert.equal(got.headers.get('content-type'), 'image/webp');
  assert.match(got.headers.get('cache-control'), /immutable/);
  assert.deepEqual(got.data, webp);
  // garbage, wrong type, oversized, non-image targets and missing CSRF header are rejected
  assert.equal((await api('PUT', q, Buffer.from('<svg onload=alert(1)>'), { 'content-type': 'image/webp' })).status, 400);
  assert.equal((await api('PUT', q, webp, { 'content-type': 'text/html' })).status, 415);
  assert.equal((await api('PUT', q, Buffer.alloc(600 * 1024), { 'content-type': 'image/webp' })).status, 413);
  await upload('/', 'notes.txt', 'hello');
  assert.equal((await api('PUT', `/api/thumb?path=${encodeURIComponent('/notes.txt')}`, webp, { 'content-type': 'image/webp' })).status, 400);
  assert.equal((await api('PUT', q, webp, { 'content-type': 'image/webp', 'x-drive-request': '' })).status, 403);
  // replacing the image changes size/mtime, so the old thumbnail no longer applies
  await upload('/', 'photo.png', Buffer.concat([png, Buffer.alloc(10)]), 'overwrite');
  assert.equal((await api('GET', q)).status, 404);
});
