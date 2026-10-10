import { DatabaseSync } from 'node:sqlite';
import { createHash, randomBytes, scrypt as rawScrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { existsSync } from 'node:fs';
const scrypt = promisify(rawScrypt);
export const tokenHash = value => createHash('sha256').update(value).digest('hex');
const id = prefix => `${prefix}_${randomBytes(16).toString('hex')}`;
const now = () => new Date().toISOString();
const dummy = `scrypt$32768$8$3$${randomBytes(16).toString('base64url')}$${randomBytes(64).toString('base64url')}`;

export async function passwordHash(password) {
  const salt = randomBytes(16).toString('base64url');
  const hash = await scrypt(password, salt, 64, { N:32768,r:8,p:3,maxmem:64*1024*1024 });
  return `scrypt$32768$8$3$${salt}$${hash.toString('base64url')}`;
}
export async function verifyPassword(password, encoded) {
  if (typeof password !== 'string' || !password || Buffer.byteLength(password)>256) return false;
  const [algo,n,r,p,salt,hash,...rest] = String(encoded).split('$');
  if (algo!=='scrypt' || rest.length || Number(n)!==32768 || Number(r)!==8 || ![1,3].includes(Number(p)) || !salt || !hash) return false;
  const expected = Buffer.from(hash,'base64url');
  if (expected.length!==64) return false;
  const actual = await scrypt(password,salt,64,{N:Number(n),r:Number(r),p:Number(p),maxmem:64*1024*1024});
  return timingSafeEqual(actual,expected);
}
function strong(password) {
  return typeof password==='string' && [...password].length>=8 && Buffer.byteLength(password)<=256
    && [/[a-z]/,/[A-Z]/,/[0-9]/,/[^A-Za-z0-9]/].filter(r=>r.test(password)).length>=3;
}
export class IdentityStore {
  constructor(path) {
    if (!existsSync(path)) throw new Error('Identity authority missing');
    this.db = new DatabaseSync(path);
    this.db.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
    if (this.db.prepare('SELECT version FROM identity_meta WHERE id=1').get()?.version!==1) throw new Error('Identity schema mismatch');
  }
  publicUser(row) {
    return {id:row.id,username:row.username,email:row.email,role:row.role,
      passwordChangeRequired:row.password_change_required===1,
      grants:this.db.prepare('SELECT service FROM identity_grants WHERE user_id=? ORDER BY service').all(row.id).map(r=>r.service)};
  }
  session(token) {
    if (typeof token!=='string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
    const row=this.db.prepare(`SELECT u.*,s.id AS session_id,s.expires_at FROM auth_sessions s
      JOIN users u ON u.id=s.user_id WHERE s.session_token_hash=? AND s.expires_at>? AND u.status='active'`).get(tokenHash(token),now());
    if (!row) return null;
    return {user:this.publicUser(row),sessionId:row.session_id,expiresAt:row.expires_at};
  }
  authorized(session,service) {
    return !!session && !session.user.passwordChangeRequired && session.user.grants.includes(service)
      && (!['status','photo-admin','live-admin'].includes(service) || session.user.role==='admin');
  }
  async login(identifier,password) {
    const name=typeof identifier==='string'?identifier.trim():'';
    if (!name || name.length>320) return null;
    const row=this.db.prepare('SELECT * FROM users WHERE username=? COLLATE NOCASE OR email=? COLLATE NOCASE').get(name,name);
    const ok=await verifyPassword(password,row?.status==='active'?row.password_hash:dummy);
    if (!row || row.status!=='active' || !ok) return null;
    // A concurrent reset/disable must not mint a session from stale verification.
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const current=this.db.prepare('SELECT * FROM users WHERE id=?').get(row.id);
      if (current.status!=='active' || current.password_hash!==row.password_hash) {this.db.exec('ROLLBACK');return null;}
      const token=randomBytes(32).toString('base64url'), stamp=now();
      this.db.prepare(`INSERT INTO auth_sessions(id,user_id,session_token_hash,created_at,expires_at,last_seen_at,ip,user_agent,meta_json)
        VALUES(?,?,?,?,?,?,NULL,NULL,'{}')`).run(id('sess'),row.id,tokenHash(token),stamp,new Date(Date.now()+7*86400000).toISOString(),stamp);
      this.db.prepare('UPDATE users SET last_login_at=? WHERE id=?').run(stamp,row.id);
      this.db.exec('COMMIT');
      return {token,...this.session(token)};
    } catch(e) {this.db.exec('ROLLBACK');throw e;}
  }
  logout(token) {if (token) this.db.prepare('DELETE FROM auth_sessions WHERE session_token_hash=?').run(tokenHash(token));}
  async changePassword(token,current,next) {
    const session=this.session(token);
    if (!session || !strong(next) || current===next) return false;
    const row=this.db.prepare('SELECT password_hash FROM users WHERE id=?').get(session.user.id);
    if (!await verifyPassword(current,row.password_hash)) return false;
    const hash=await passwordHash(next);
    this.db.exec('BEGIN IMMEDIATE');
    try {
      if (!this.session(token) || this.db.prepare('SELECT password_hash FROM users WHERE id=?').get(session.user.id)?.password_hash!==row.password_hash) {
        this.db.exec('ROLLBACK');return false;
      }
      this.db.prepare('UPDATE users SET password_hash=?,password_change_required=0,updated_at=? WHERE id=?').run(hash,now(),session.user.id);
      this.db.prepare('DELETE FROM auth_sessions WHERE user_id=? AND id<>?').run(session.user.id,session.sessionId);
      this.db.prepare(`INSERT INTO user_admin_audit_events(id,actor_user_id,target_user_id,action,details_json,created_at)
        VALUES(?,?,?,'password_changed','{"source":"unified-account"}',?)`).run(id('audit'),session.user.id,session.user.id,now());
      this.db.exec('COMMIT');return true;
    } catch(e) {this.db.exec('ROLLBACK');throw e;}
  }
  close() {this.db.close();}
}
