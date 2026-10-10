import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { IdentityStore, passwordHash } from '../server/store.mjs';
import { createIdentityServer,cookieToken } from '../server/server.mjs';

async function fixture() {
 const dir=mkdtempSync(join(tmpdir(),'chufa-identity-')),path=join(dir,'identity.sqlite');
 const db=new DatabaseSync(path);
 db.exec(`CREATE TABLE identity_meta(id INTEGER PRIMARY KEY,version INTEGER,revision INTEGER);INSERT INTO identity_meta VALUES(1,1,0);
 CREATE TABLE users(id TEXT PRIMARY KEY,username TEXT,email TEXT,role TEXT,status TEXT,password_hash TEXT,password_change_required INTEGER,last_login_at TEXT,updated_at TEXT);
 CREATE TABLE identity_grants(user_id TEXT,service TEXT,PRIMARY KEY(user_id,service));
 CREATE TABLE auth_sessions(id TEXT PRIMARY KEY,user_id TEXT,session_token_hash TEXT,created_at TEXT,expires_at TEXT,last_seen_at TEXT,ip TEXT,user_agent TEXT,meta_json TEXT);
 CREATE TABLE user_admin_audit_events(id TEXT,actor_user_id TEXT,target_user_id TEXT,action TEXT,details_json TEXT,created_at TEXT);`);
 db.prepare('INSERT INTO users VALUES (?,?,?,?,?,?,0,NULL,NULL)').run('p','preview','preview@example.invalid','admin','active',await passwordHash('Preview-Test-123'));
 for(const scope of ['drive','status','photo-admin','live-admin'])db.prepare('INSERT INTO identity_grants VALUES (?,?)').run('p',scope);
 const store=new IdentityStore(path),key='t'.repeat(48);
 const server=createIdentityServer({store,clients:[{token:key,services:['drive','status','photo-admin']}],origin:'https://chufa.wang'});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base=`http://127.0.0.1:${server.address().port}`;
 return {db,store,key,base,close:async()=>{await new Promise(r=>server.close(r));store.close();db.close();rmSync(dir,{recursive:true,force:true});}};
}
const post=(f,path,body,cookie)=>fetch(f.base+path,{method:'POST',headers:{Origin:'https://chufa.wang','Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},body:JSON.stringify(body)});

test('cookie parsing rejects ambiguity and injected non-token values',()=>{
 assert.equal(cookieToken('chufa_session=x'),null);
 assert.equal(cookieToken(`chufa_session=${'x'.repeat(43)}; chufa_session=${'y'.repeat(43)}`),null);
 assert.equal(cookieToken(`other=x; chufa_session=${'x'.repeat(43)}`),'x'.repeat(43));
});
test('central login grants, global logout, scoped internal clients and CSRF protection',async()=>{
 const f=await fixture();try{
  const csrf=await fetch(f.base+'/account/api/login',{method:'POST',headers:{Origin:'https://evil.invalid','Content-Type':'application/json'},body:'{}'});assert.equal(csrf.status,403);
  const login=await post(f,'/account/api/login',{identifier:'preview',password:'Preview-Test-123'});assert.equal(login.status,200);
  const cookie=login.headers.get('set-cookie').split(';')[0];assert.match(login.headers.get('set-cookie'),/HttpOnly; Secure; SameSite=Lax/);
  const body=await login.json();assert.equal(body.user.username,'preview');assert.equal('password_hash'in body.user,false);
  assert.equal((await fetch(f.base+'/internal/session?service=drive',{headers:{Cookie:cookie}})).status,403);
  const headers={Cookie:cookie,Authorization:`Bearer ${f.key}`};
  assert.equal((await fetch(f.base+'/internal/session?service=drive',{headers})).status,200);
  assert.equal((await fetch(f.base+'/internal/check?service=status',{headers})).status,204);
  assert.equal((await fetch(f.base+'/internal/session?service=live-admin',{headers})).status,403,'client cannot choose an unassigned service');
  f.db.prepare("UPDATE users SET role='member' WHERE id='p'").run();
  assert.equal((await fetch(f.base+'/internal/check?service=status',{headers})).status,403);
  assert.equal((await fetch(f.base+'/internal/session?service=drive',{headers})).status,200);
  await post(f,'/account/api/logout',{},cookie);
  assert.equal((await fetch(f.base+'/internal/session?service=drive',{headers})).status,401);
 }finally{await f.close();}
});
test('password changes revoke other sessions; forced changes block service access',async()=>{
 const f=await fixture();try{
  const first=await f.store.login('preview','Preview-Test-123'),second=await f.store.login('preview','Preview-Test-123');
  f.db.prepare("UPDATE users SET password_change_required=1 WHERE id='p'").run();
  assert.equal(f.store.authorized(f.store.session(first.token),'drive'),false);
  assert.equal(await f.store.changePassword(first.token,'wrong','Changed-Test-456'),false);
  assert.equal(await f.store.changePassword(first.token,'Preview-Test-123','Changed-Test-456'),true);
  assert.equal(f.store.session(second.token),null);
  assert.equal(f.store.authorized(f.store.session(first.token),'drive'),true);
  assert.equal(await f.store.login('preview','Preview-Test-123'),null);
  assert.ok(await f.store.login('preview','Changed-Test-456'));
  f.db.prepare("UPDATE users SET status='disabled' WHERE id='p'").run();
  assert.equal(f.store.session(first.token),null);
  assert.equal(await f.store.login('preview','Changed-Test-456'),null);
 }finally{await f.close();}
});
test('concurrent failed login attempts are limited before expensive verification',async()=>{
 const f=await fixture();try{
  const results=await Promise.all(Array.from({length:12},()=>post(f,'/account/api/login',{identifier:'preview',password:'wrong'})));
  assert.ok(results.filter(r=>r.status===429).length>=4);
 }finally{await f.close();}
});
