#!/usr/bin/env node
import { createHash, createPublicKey, createVerify } from 'node:crypto';
import { createWriteStream, existsSync } from 'node:fs';
import { mkdir, readFile, readlink, rename, rm, symlink, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { basename, join, posix } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = process.env.OUTDOOR_DEPLOY_ROOT || '/srv/helper_sites/releases/osaka-mountain-picker-http';
const RELEASES = join(ROOT, 'releases');
const INCOMING = join(ROOT, 'incoming');
const CURRENT = join(ROOT, 'current');
const STATE_FILE = join(ROOT, 'state.json');
const WEATHER_CURRENT = process.env.OUTDOOR_WEATHER_CURRENT || '/srv/helper_sites/services/osaka-mountain-weather/current';
const WEATHER_SERVICE = process.env.OUTDOOR_WEATHER_SERVICE || 'helper-sites-osaka-mountain-weather.service';
const WEATHER_HEALTH_URL = process.env.OUTDOOR_WEATHER_HEALTH_URL || 'http://127.0.0.1:4188/health';
const PORT = Number.parseInt(process.env.OUTDOOR_DEPLOY_PORT || '4191', 10);
const MAX_BYTES = Number.parseInt(process.env.OUTDOOR_DEPLOY_MAX_BYTES || String(256 * 1024 * 1024), 10);
const RELEASE_RE = /^outdoor-\d{8}T\d{6}Z-[0-9a-f]{12}$/;
const COMMIT_RE = /^[0-9a-f]{40}$/;
const SHA256_RE = /^[0-9a-f]{64}$/;
const REQUEST_RE = /^[a-z0-9][a-z0-9_-]{0,79}$/;
const OIDC_ISSUER = 'https://token.actions.githubusercontent.com';
const OIDC_JWKS_URL = 'https://token.actions.githubusercontent.com/.well-known/jwks';
const OIDC_AUDIENCE = process.env.OUTDOOR_OIDC_AUDIENCE || 'osaka-mountain-outdoor-deploy';
const OIDC_REPOSITORY = process.env.OUTDOOR_OIDC_REPOSITORY || 'whaleinblack/chufa.wang';
const OIDC_WORKFLOW = process.env.OUTDOOR_OIDC_WORKFLOW || 'deploy-outdoor.yml';
const OIDC_REF = process.env.OUTDOOR_OIDC_REF || 'refs/heads/main';
let deploymentActive = false;
let jwksCache = { expiresAt: 0, keys: [] };

export function validateDeployMetadata({ commit, sha256, requestId }) {
  if (!COMMIT_RE.test(commit)) throw new Error('invalid source commit');
  if (!SHA256_RE.test(sha256)) throw new Error('invalid artifact checksum');
  if (!REQUEST_RE.test(requestId)) throw new Error('invalid request id');
  return { commit, sha256, requestId };
}

export function validateTarEntries(entries, verboseEntries = []) {
  if (!entries.length || entries.length > 30_000) throw new Error('invalid artifact entry count');
  for (const raw of entries) {
    if (raw === './' || raw === '.') continue;
    const entry = raw.replace(/^\.\//, '');
    const normalized = posix.normalize(entry);
    if (!entry || entry.includes('\\') || posix.isAbsolute(entry) || normalized === '..' || normalized.startsWith('../')) {
      throw new Error(`unsafe artifact path: ${raw}`);
    }
  }
  for (const line of verboseEntries) {
    if (line.startsWith('l') || line.startsWith('h')) throw new Error('artifact links are not allowed');
  }
  const normalized = new Set(entries.map((entry) => entry.replace(/^\.\//, '').replace(/\/$/, '')).filter(Boolean));
  if (!normalized.has('site/index.html') || !normalized.has('weather/weather-api.mjs')) {
    throw new Error('artifact is missing static site or weather service files');
  }
  return true;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
    ...options,
  });
  if (result.status !== 0) {
    throw new Error(`${command} failed: ${(result.stderr || result.stdout || '').trim().slice(0, 2000)}`);
  }
  return result.stdout;
}

function base64urlJson(value) {
  return JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
}

export function validateOidcClaims(claims, nowSeconds = Math.floor(Date.now() / 1000)) {
  const audience = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  const expectedWorkflowRef = `${OIDC_REPOSITORY}/.github/workflows/${OIDC_WORKFLOW}@${OIDC_REF}`;
  if (claims.iss !== OIDC_ISSUER) throw new Error('invalid OIDC issuer');
  if (!audience.includes(OIDC_AUDIENCE)) throw new Error('invalid OIDC audience');
  if (claims.repository !== OIDC_REPOSITORY) throw new Error('invalid OIDC repository');
  if (claims.ref !== OIDC_REF) throw new Error('invalid OIDC ref');
  if (claims.workflow_ref !== expectedWorkflowRef && claims.job_workflow_ref !== expectedWorkflowRef) {
    throw new Error('invalid OIDC workflow');
  }
  if (claims.event_name !== 'workflow_dispatch') throw new Error('invalid OIDC event');
  if (!Number.isFinite(claims.exp) || claims.exp < nowSeconds - 30) throw new Error('expired OIDC token');
  if (Number.isFinite(claims.nbf) && claims.nbf > nowSeconds + 30) throw new Error('OIDC token is not active');
  return claims;
}

async function githubJwks() {
  if (jwksCache.expiresAt > Date.now()) return jwksCache.keys;
  const response = await fetch(OIDC_JWKS_URL, { signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error(`OIDC JWKS HTTP ${response.status}`);
  const body = await response.json();
  if (!body || !Array.isArray(body.keys)) throw new Error('invalid OIDC JWKS');
  jwksCache = { expiresAt: Date.now() + 60 * 60 * 1000, keys: body.keys };
  return jwksCache.keys;
}

export async function verifyGitHubOidcAuthorization(authorization) {
  if (!authorization.startsWith('Bearer ')) throw new Error('missing OIDC bearer token');
  const token = authorization.slice(7);
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('invalid OIDC token');
  const header = base64urlJson(parts[0]);
  const claims = base64urlJson(parts[1]);
  if (header.alg !== 'RS256' || typeof header.kid !== 'string') throw new Error('unsupported OIDC signature');
  const jwk = (await githubJwks()).find((candidate) => candidate.kid === header.kid && candidate.kty === 'RSA');
  if (!jwk) throw new Error('unknown OIDC signing key');
  const verifier = createVerify('RSA-SHA256');
  verifier.update(`${parts[0]}.${parts[1]}`);
  verifier.end();
  if (!verifier.verify(createPublicKey({ key: jwk, format: 'jwk' }), Buffer.from(parts[2], 'base64url'))) {
    throw new Error('invalid OIDC signature');
  }
  return validateOidcClaims(claims);
}

function json(response, status, payload) {
  const body = JSON.stringify(payload);
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  response.end(body);
}

async function currentReleasePath() {
  try {
    const target = await readlink(CURRENT);
    return target.startsWith('/') ? target : join(ROOT, target);
  } catch {
    return null;
  }
}

async function currentWeatherPath() {
  try {
    const target = await readlink(WEATHER_CURRENT);
    return target.startsWith('/') ? target : join('/srv/helper_sites/services/osaka-mountain-weather', target);
  } catch {
    return null;
  }
}

async function readState() {
  try {
    return JSON.parse(await readFile(STATE_FILE, 'utf8'));
  } catch {
    return { currentRelease: null, previousRelease: null, updatedAt: null };
  }
}

async function writeState(state) {
  const temporary = `${STATE_FILE}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o640 });
  await rename(temporary, STATE_FILE);
}

async function atomicLink(link, target) {
  const temporary = `${link}.${process.pid}.tmp`;
  await rm(temporary, { force: true });
  await symlink(target, temporary, 'dir');
  await rename(temporary, link);
}

async function streamArtifact(request, target, expectedSha) {
  const announcedLength = Number.parseInt(request.headers['content-length'] || '', 10);
  if (!Number.isFinite(announcedLength) || announcedLength <= 0 || announcedLength > MAX_BYTES) {
    throw new Error('invalid artifact content length');
  }
  const hash = createHash('sha256');
  const output = createWriteStream(target, { flags: 'wx', mode: 0o600 });
  let received = 0;
  try {
    for await (const chunk of request) {
      received += chunk.length;
      if (received > MAX_BYTES) throw new Error('artifact exceeds size limit');
      hash.update(chunk);
      if (!output.write(chunk)) await new Promise((resolve) => output.once('drain', resolve));
    }
    await new Promise((resolve, reject) => output.end((error) => error ? reject(error) : resolve()));
  } catch (error) {
    output.destroy();
    throw error;
  }
  if (received !== announcedLength) throw new Error('artifact length mismatch');
  const actual = hash.digest('hex');
  if (actual !== expectedSha) throw new Error('artifact checksum mismatch');
  return received;
}

function inspectArtifact(archive) {
  const entries = run('tar', ['-tzf', archive]).split(/\r?\n/u).filter(Boolean);
  const verbose = run('tar', ['-tvzf', archive]).split(/\r?\n/u).filter(Boolean);
  validateTarEntries(entries, verbose);
}

async function releaseManifest(path) {
  try {
    return JSON.parse(await readFile(join(path, '.release.json'), 'utf8'));
  } catch {
    return null;
  }
}

async function validateExtractedRelease(path) {
  const sitePath = join(path, 'site');
  const html = await readFile(join(sitePath, 'index.html'), 'utf8');
  if (!html.includes('下一座山') || !html.includes('/outdoor/')) {
    throw new Error('static index does not target /outdoor');
  }
  const referenced = [...html.matchAll(/(?:src|href)=["'](\/outdoor\/[^"']+)["']/gu)]
    .map((match) => match[1].slice('/outdoor/'.length))
    .filter((value) => value && !value.startsWith('http'));
  if (!referenced.length) throw new Error('static index has no /outdoor assets');
  for (const relative of referenced) {
    const decoded = decodeURIComponent(relative.split(/[?#]/u)[0]);
    if (decoded.includes('..') || decoded.includes('\\') || !existsSync(join(sitePath, decoded))) {
      throw new Error(`missing or unsafe static asset: ${relative}`);
    }
  }
  if (!existsSync(join(path, 'weather', 'weather-api.mjs'))) throw new Error('weather service is missing');
}

async function waitForWeatherHealth(timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  let last = 'no response';
  while (Date.now() < deadline) {
    try {
      const response = await fetch(WEATHER_HEALTH_URL, { signal: AbortSignal.timeout(4000) });
      const body = await response.json();
      if (response.status === 200 && body?.status === 'ok') return;
      last = `HTTP ${response.status}`;
    } catch (error) {
      last = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`weather health check failed: ${last}`);
}

async function deploy(request, metadata) {
  const existingPath = await currentReleasePath();
  const existingWeatherPath = await currentWeatherPath();
  const existingManifest = existingPath ? await releaseManifest(existingPath) : null;
  if (existingManifest?.commit === metadata.commit && existingManifest?.sha256 === metadata.sha256) {
    return { status: 'unchanged', releaseId: basename(existingPath), ...existingManifest };
  }

  await mkdir(RELEASES, { recursive: true, mode: 0o750 });
  await mkdir(INCOMING, { recursive: true, mode: 0o750 });
  const archive = join(INCOMING, `${metadata.requestId}.tar.gz`);
  const staging = join(RELEASES, `.staging-${metadata.requestId}`);
  const stamp = new Date().toISOString().replace(/[-:]/gu, '').replace(/\.\d{3}Z$/u, 'Z');
  const releaseId = `outdoor-${stamp}-${metadata.commit.slice(0, 12)}`;
  const releasePath = join(RELEASES, releaseId);
  await rm(archive, { force: true });
  await rm(staging, { recursive: true, force: true });

  try {
    const bytes = await streamArtifact(request, archive, metadata.sha256);
    inspectArtifact(archive);
    await mkdir(staging, { recursive: true, mode: 0o750 });
    run('tar', ['--extract', '--gzip', '--file', archive, '--directory', staging, '--no-same-owner', '--no-same-permissions']);
    await validateExtractedRelease(staging);
    const manifest = {
      releaseId,
      commit: metadata.commit,
      sha256: metadata.sha256,
      requestId: metadata.requestId,
      deployedAt: new Date().toISOString(),
      bytes,
    };
    await writeFile(join(staging, '.release.json'), `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o640 });
    run('chown', ['-R', 'root:www-data', staging]);
    run('chmod', ['-R', 'u=rwX,g=rX,o=rX', staging]);
    await rename(staging, releasePath);

    const previousPath = existingPath;
    const previousWeatherPath = existingWeatherPath;
    await atomicLink(CURRENT, releasePath);
    await atomicLink(WEATHER_CURRENT, join(releasePath, 'weather'));
    try {
      run('systemctl', ['restart', WEATHER_SERVICE]);
      await waitForWeatherHealth();
    } catch (error) {
      if (previousPath && existsSync(previousPath)) await atomicLink(CURRENT, previousPath);
      else await rm(CURRENT, { force: true });
      if (previousWeatherPath && existsSync(previousWeatherPath)) {
        await atomicLink(WEATHER_CURRENT, previousWeatherPath);
        run('systemctl', ['restart', WEATHER_SERVICE]);
        await waitForWeatherHealth(15_000);
      }
      throw error;
    }

    const state = {
      currentRelease: releasePath,
      previousRelease: previousPath,
      previousWeather: previousWeatherPath,
      updatedAt: new Date().toISOString(),
    };
    await writeState(state);
    await pruneReleases(new Set([releasePath, previousPath].filter(Boolean)), 5);
    return { status: 'deployed', ...manifest, previousReleaseId: previousPath ? basename(previousPath) : null };
  } finally {
    await rm(archive, { force: true });
    await rm(staging, { recursive: true, force: true });
  }
}

async function rollback() {
  const state = await readState();
  const current = await currentReleasePath();
  const currentWeather = await currentWeatherPath();
  const previous = state.previousRelease;
  if (previous && (!RELEASE_RE.test(basename(previous)) || !existsSync(previous))) {
    throw new Error('no valid previous release');
  }
  const rollbackWeather = previous ? join(previous, 'weather') : state.previousWeather;
  if (!rollbackWeather || !existsSync(rollbackWeather)) throw new Error('previous weather release is missing');
  if (previous) await atomicLink(CURRENT, previous);
  else await rm(CURRENT, { force: true });
  await atomicLink(WEATHER_CURRENT, rollbackWeather);
  try {
    run('systemctl', ['restart', WEATHER_SERVICE]);
    await waitForWeatherHealth();
  } catch (error) {
    if (current && existsSync(current)) await atomicLink(CURRENT, current);
    if (currentWeather && existsSync(currentWeather)) await atomicLink(WEATHER_CURRENT, currentWeather);
    run('systemctl', ['restart', WEATHER_SERVICE]);
    await waitForWeatherHealth(15_000);
    throw error;
  }
  await writeState({ currentRelease: previous, previousRelease: current, previousWeather: currentWeather, updatedAt: new Date().toISOString() });
  return { status: 'rolled_back', releaseId: previous ? basename(previous) : null, previousReleaseId: current ? basename(current) : null };
}

async function pruneReleases(protectedPaths, keep) {
  const { readdir } = await import('node:fs/promises');
  const entries = await readdir(RELEASES, { withFileTypes: true });
  const candidates = entries
    .filter((entry) => entry.isDirectory() && RELEASE_RE.test(entry.name))
    .map((entry) => join(RELEASES, entry.name))
    .filter((path) => !protectedPaths.has(path))
    .sort()
    .reverse();
  for (const path of candidates.slice(keep)) await rm(path, { recursive: true, force: true });
}

async function status() {
  const current = await currentReleasePath();
  const state = await readState();
  return {
    status: 'ok',
    busy: deploymentActive,
    currentReleaseId: current ? basename(current) : null,
    previousReleaseId: state.previousRelease ? basename(state.previousRelease) : null,
    weatherRelease: await currentWeatherPath(),
    manifest: current ? await releaseManifest(current) : null,
  };
}

export function createDeployServer({ authenticate = verifyGitHubOidcAuthorization } = {}) {
  return createServer(async (request, response) => {
    const url = new URL(request.url || '/', 'http://127.0.0.1');
    if (url.pathname === '/healthz') return json(response, 200, { status: 'ok' });
    try {
      await authenticate(request.headers.authorization || '');
    } catch {
      return json(response, 401, { error: 'unauthorized' });
    }

    try {
      if (request.method === 'GET' && url.pathname === '/v1/status') return json(response, 200, await status());
      if (request.method === 'POST' && url.pathname === '/v1/rollback') {
        if (deploymentActive) return json(response, 409, { error: 'deployment in progress' });
        deploymentActive = true;
        try { return json(response, 200, await rollback()); } finally { deploymentActive = false; }
      }
      if (request.method === 'POST' && url.pathname === '/v1/deploy') {
        if (deploymentActive) return json(response, 409, { error: 'deployment in progress' });
        const metadata = validateDeployMetadata({
          commit: String(request.headers['x-source-commit'] || ''),
          sha256: String(request.headers['x-artifact-sha256'] || ''),
          requestId: String(request.headers['x-request-id'] || ''),
        });
        deploymentActive = true;
        try { return json(response, 200, await deploy(request, metadata)); } finally { deploymentActive = false; }
      }
      return json(response, 404, { error: 'not found' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'deployment failed';
      return json(response, 500, { error: message.slice(0, 2000) });
    }
  });
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const server = createDeployServer();
  server.listen(PORT, '127.0.0.1', () => {
    console.log(`outdoor-deployd listening on http://127.0.0.1:${PORT}`);
  });
}
