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
    // Additive account-event extension: keep the base identity schema compatible
    // with existing production applications and their rollback binaries.
    this.db.exec(`CREATE TABLE IF NOT EXISTS identity_account_events (
      id TEXT PRIMARY KEY,actor_user_id TEXT REFERENCES users(id),target_user_id TEXT NOT NULL REFERENCES users(id),
      action TEXT NOT NULL CHECK(action IN ('registered','member_created','service_access_changed')),
      details_json TEXT NOT NULL,created_at TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS idx_identity_account_events_target ON identity_account_events(target_user_id,created_at);`);
    this.db.exec(`CREATE TABLE IF NOT EXISTS identity_profile_events (
      id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),
      changed_fields_json TEXT NOT NULL,created_at TEXT NOT NULL);`);
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
  serviceUser({id: userId,username,service}) {
    if ((!!userId === !!username) || typeof service !== 'string') return null;
    const field=userId?'id':'username',value=userId||username;
    if(typeof value!=='string'||!value||value.length>320)return null;
    const row=this.db.prepare(`SELECT u.id,u.username,u.role,u.password_change_required FROM users u
      JOIN identity_grants g ON g.user_id=u.id WHERE u.${field}=? COLLATE NOCASE
      AND u.status='active' AND u.password_change_required=0 AND g.service=?`).get(value,service);
    return row?{id:row.id,username:row.username,role:row.role,passwordChangeRequired:false,grants:[service]}:null;
  }

  ownProfile(token) {
    const session=this.session(token);
    if(!session)throw Object.assign(Error('AUTH_REQUIRED'),{code:'AUTH_REQUIRED',status:401});
    const row=this.db.prepare('SELECT * FROM users WHERE id=?').get(session.user.id);
    let profile={};try{const parsed=JSON.parse(row.profile_json||'{}');if(parsed&&typeof parsed==='object'&&!Array.isArray(parsed))profile=parsed;}catch{}
    return {id:row.id,username:row.username,email:row.email,displayName:typeof profile.displayName==='string'?profile.displayName:row.username,emailVerified:!!row.email_verified_at,updatedAt:row.updated_at};
  }

  async updateOwnProfile(token,input) {
    const reject=(code,status=400)=>{throw Object.assign(Error(code),{code,status});};
    if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(key=>!['displayName','email','expectedUpdatedAt','currentPassword'].includes(key)))reject('PROFILE_INVALID');
    if(typeof input.displayName!=='string'||typeof input.email!=='string'||typeof input.expectedUpdatedAt!=='string'||(input.currentPassword!==undefined&&typeof input.currentPassword!=='string'))reject('PROFILE_INVALID');
    const displayName=input.displayName.normalize('NFC').trim(),email=input.email.normalize('NFC').trim().toLowerCase();
    if(!displayName||[...displayName].length>80||/[\u0000-\u001f\u007f]/.test(displayName))reject('PROFILE_INVALID');
    if(email.length>254||!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))reject('EMAIL_INVALID');
    const session=this.session(token);if(!session)reject('AUTH_REQUIRED',401);
    if(session.user.passwordChangeRequired)reject('PASSWORD_CHANGE_REQUIRED',403);
    const before=this.db.prepare('SELECT * FROM users WHERE id=?').get(session.user.id);
    const emailChanged=email!==String(before.email).toLowerCase();
    if(emailChanged){
      if(!input.currentPassword)reject('PROFILE_PASSWORD_REQUIRED');
      if(!await verifyPassword(input.currentPassword,before.password_hash))reject('BAD_CREDENTIALS',401);
    }
    this.db.exec('BEGIN IMMEDIATE');
    try{
      const currentSession=this.session(token);if(!currentSession||currentSession.user.id!==before.id)reject('AUTH_REQUIRED',401);
      const current=this.db.prepare('SELECT * FROM users WHERE id=?').get(before.id);
      if(current.password_change_required)reject('PASSWORD_CHANGE_REQUIRED',403);
      if(current.updated_at!==input.expectedUpdatedAt)reject('PROFILE_STALE',409);
      if(emailChanged&&current.password_hash!==before.password_hash)reject('BAD_CREDENTIALS',401);
      if(this.db.prepare('SELECT 1 FROM users WHERE email=? COLLATE NOCASE AND id<>?').get(email,current.id))reject('ACCOUNT_EXISTS',409);
      let profile={};try{const parsed=JSON.parse(current.profile_json||'{}');if(parsed&&typeof parsed==='object'&&!Array.isArray(parsed))profile=parsed;}catch{}
      const changed=[];if((profile.displayName??current.username)!==displayName)changed.push('displayName');if(emailChanged)changed.push('email');
      if(changed.length){
        const stamp=new Date(Math.max(Date.now(),(Date.parse(current.updated_at)||0)+1)).toISOString();
        this.db.prepare('UPDATE users SET profile_json=?,email=?,email_verified_at=?,updated_at=? WHERE id=?').run(JSON.stringify({...profile,displayName}),email,emailChanged?null:current.email_verified_at,stamp,current.id);
        this.db.prepare('INSERT INTO identity_profile_events(id,user_id,changed_fields_json,created_at) VALUES(?,?,?,?)').run(id('profile'),current.id,JSON.stringify(changed),stamp);
      }
      const result=this.ownProfile(token);this.db.exec('COMMIT');return result;
    }catch(error){this.db.exec('ROLLBACK');throw error;}
  }

  async register(input) {
    const reject=(code,status=400)=>{throw Object.assign(Error(code),{code,status});};
    if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(key=>!['username','email','password'].includes(key)))reject('REGISTRATION_INVALID');
    const username=typeof input.username==='string'?input.username.normalize('NFC').trim():'';
    const email=typeof input.email==='string'?input.email.normalize('NFC').trim().toLowerCase():'';
    if(!/^[A-Za-z0-9][A-Za-z0-9._-]{2,31}$/.test(username))reject('USERNAME_INVALID');
    if(email.length>254||!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))reject('EMAIL_INVALID');
    if(!strong(input.password))reject('PASSWORD_WEAK');
    const hash=await passwordHash(input.password),userId=id('usr'),stamp=now();
    this.db.exec('BEGIN IMMEDIATE');
    try {
      if(this.db.prepare('SELECT 1 FROM users WHERE username=? COLLATE NOCASE OR email=? COLLATE NOCASE').get(username,email))reject('ACCOUNT_EXISTS',409);
      this.db.prepare(`INSERT INTO users(id,username,email,password_hash,status,role,email_verified_at,password_change_required,created_at,updated_at,profile_json,flags_json,assistant_turn_daily_limit,assistant_route_daily_limit,assistant_weather_daily_limit)
        VALUES(?,?,?,?,'active','member',NULL,0,?,?,'{}','{}',50,50,50)`).run(userId,username,email,hash,stamp,stamp);
      // Public signup grants only the normal travel application. Other services
      // require an administrator's separate decision; resource ACLs remain local.
      this.db.prepare('INSERT INTO identity_grants(user_id,service) VALUES (?,?)').run(userId,'production');
      this.db.prepare(`INSERT INTO identity_account_events(id,actor_user_id,target_user_id,action,details_json,created_at) VALUES(?,?,?,'registered','{"source":"central-signup","emailVerified":false}',?)`).run(id('audit'),userId,userId,stamp);
      const result=this.issueSession(this.db.prepare('SELECT * FROM users WHERE id=?').get(userId));
      this.db.exec('COMMIT');return result;
    } catch(error) {this.db.exec('ROLLBACK');throw error;}
  }

  issueSession(row) {
    const token=randomBytes(32).toString('base64url'),stamp=now();
    this.db.prepare(`INSERT INTO auth_sessions(id,user_id,session_token_hash,created_at,expires_at,last_seen_at,ip,user_agent,meta_json)
      VALUES(?,?,?,?,?,?,NULL,NULL,'{}')`).run(id('sess'),row.id,tokenHash(token),stamp,new Date(Date.now()+7*86400000).toISOString(),stamp);
    this.db.prepare('UPDATE users SET last_login_at=? WHERE id=?').run(stamp,row.id);
    return {token,...this.session(token)};
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
      const result=this.issueSession(current);
      this.db.exec('COMMIT');
      return result;
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
