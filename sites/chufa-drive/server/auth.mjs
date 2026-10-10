import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { readJson, writeJsonAtomic } from './util.mjs';

const scrypt = promisify(scryptCb);
const SCRYPT = { N: 32768, r: 8, p: 1, keylen: 64 };
const SCRYPT_OPTS = (n) => ({ N: n, r: SCRYPT.r, p: SCRYPT.p, maxmem: 128 * n * SCRYPT.r * 2 });

export async function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = await scrypt(password.normalize('NFKC'), salt, SCRYPT.keylen, SCRYPT_OPTS(SCRYPT.N));
  return { algo: 'scrypt', N: SCRYPT.N, salt: salt.toString('base64'), hash: hash.toString('base64') };
}

export async function verifyPassword(password, record) {
  const salt = Buffer.from(record.salt, 'base64');
  const expected = Buffer.from(record.hash, 'base64');
  const actual = await scrypt(password.normalize('NFKC'), salt, expected.length, SCRYPT_OPTS(record.N));
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

const DUMMY = { algo: 'scrypt', N: SCRYPT.N, salt: randomBytes(16).toString('base64'), hash: randomBytes(64).toString('base64') };

const sha256 = (s) => createHash('sha256').update(s).digest('hex');

export class AuthStore {
  constructor({ usersFile, sessionsFile, sessionTtlMs, rememberTtlMs }) {
    this.usersFile = usersFile;
    this.sessionsFile = sessionsFile;
    this.sessionTtlMs = sessionTtlMs;
    this.rememberTtlMs = rememberTtlMs;
    this.sessions = new Map();
    this.failures = new Map(); // key -> { count, until, first }
    this.saveTimer = null;
    this.renewed = new WeakSet(); // sessions whose expiry just slid forward (cookie needs re-sending)
  }

  async load() {
    const data = await readJson(this.sessionsFile, { sessions: [] });
    const now = Date.now();
    for (const s of data.sessions ?? []) if (s.expires > now) this.sessions.set(s.id, s);
  }

  async users() {
    const data = await readJson(this.usersFile, { users: {} });
    return data.users ?? {};
  }

  // ----- brute-force limiting (in memory) -----
  limited(keys) {
    const now = Date.now();
    for (const key of keys) {
      const f = this.failures.get(key);
      if (f && f.until > now) return Math.ceil((f.until - now) / 1000);
    }
    return 0;
  }

  recordFailure(keys) {
    const now = Date.now();
    for (const key of keys) {
      let f = this.failures.get(key);
      if (!f || now - f.first > 15 * 60_000) f = { count: 0, until: 0, first: now };
      f.count += 1;
      const threshold = key.startsWith('ip:') ? 8 : 12;
      if (f.count >= threshold) {
        f.until = now + Math.min(60 * 60_000, 60_000 * 2 ** (f.count - threshold));
      }
      this.failures.set(key, f);
    }
    if (this.failures.size > 5000) {
      for (const [k, v] of this.failures) if (v.until < now && now - v.first > 15 * 60_000) this.failures.delete(k);
    }
  }

  async login(username, password, { ip, remember }) {
    const name = String(username ?? '').trim().toLowerCase();
    const keys = [`ip:${ip}`, `user:${name}`];
    const wait = this.limited(keys);
    if (wait) return { error: 'RATE_LIMITED', retryAfter: wait };
    const users = await this.users();
    const record = Object.hasOwn(users, name) ? users[name] : null;
    const ok = await verifyPassword(String(password ?? ''), record ?? DUMMY);
    if (!record || !ok) {
      this.recordFailure(keys);
      return { error: 'BAD_CREDENTIALS' };
    }
    for (const k of keys) this.failures.delete(k);
    const token = randomBytes(32).toString('base64url');
    const now = Date.now();
    const ttl = remember ? this.rememberTtlMs : this.sessionTtlMs;
    const session = { id: sha256(token), user: name, created: now, seen: now, expires: now + ttl, remember: !!remember, ttl };
    this.sessions.set(session.id, session);
    this.scheduleSave();
    return { token, session };
  }

  touch(token) {
    if (!token || typeof token !== 'string' || token.length > 200) return null;
    const id = sha256(token);
    const s = this.sessions.get(id);
    const now = Date.now();
    if (!s) return null;
    if (s.expires <= now) {
      this.sessions.delete(id);
      this.scheduleSave();
      return null;
    }
    if (now - s.seen > 60_000) {
      s.seen = now;
      s.expires = now + s.ttl; // sliding expiry
      this.renewed.add(s);
      this.scheduleSave();
    }
    return s;
  }

  logout(token) {
    if (!token) return;
    if (this.sessions.delete(sha256(token))) this.scheduleSave();
  }

  async changePassword(user, current, next, keepSessionId) {
    const users = await this.users();
    const record = users[user];
    if (!record || !(await verifyPassword(current, record))) return { error: 'BAD_CREDENTIALS' };
    users[user] = await hashPassword(next);
    await writeJsonAtomic(this.usersFile, { users });
    for (const [id, s] of this.sessions) if (s.user === user && id !== keepSessionId) this.sessions.delete(id);
    this.scheduleSave();
    return { ok: true };
  }

  scheduleSave() {
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      this.save().catch((e) => console.error('session save failed', e.message));
    }, 500);
    this.saveTimer.unref?.();
  }

  async save() {
    const now = Date.now();
    const sessions = [...this.sessions.values()].filter((s) => s.expires > now);
    await writeJsonAtomic(this.sessionsFile, { sessions });
  }
}
