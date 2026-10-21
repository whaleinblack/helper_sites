import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {IdentityStore,passwordHash} from '../server/store.mjs';
import {createIdentityServer} from '../server/server.mjs';

async function fixture(){
  const dir=mkdtempSync(join(tmpdir(),'chufa-profile-')),path=join(dir,'identity.sqlite'),db=new DatabaseSync(path);
  db.exec(`CREATE TABLE identity_meta(id INTEGER PRIMARY KEY,version INTEGER,revision INTEGER);INSERT INTO identity_meta VALUES(1,1,0);
    CREATE TABLE users(id TEXT PRIMARY KEY,username TEXT,email TEXT,role TEXT,status TEXT,password_hash TEXT,password_change_required INTEGER,last_login_at TEXT,updated_at TEXT,profile_json TEXT,email_verified_at TEXT);
    CREATE TABLE identity_grants(user_id TEXT,service TEXT,PRIMARY KEY(user_id,service));
    CREATE TABLE auth_sessions(id TEXT PRIMARY KEY,user_id TEXT,session_token_hash TEXT,created_at TEXT,expires_at TEXT,last_seen_at TEXT,ip TEXT,user_agent TEXT,meta_json TEXT);`);
  const hash=await passwordHash('Profile-Test-123');
  for(const [id,username,email] of [['p','person','person@example.invalid'],['q','other','other@example.invalid']])
    db.prepare("INSERT INTO users VALUES(?,?,?,'member','active',?,0,NULL,?,?,'2026-01-01T00:00:00Z')").run(id,username,email,hash,'2026-10-21T00:00:00Z','{"unrelatedPreference":"preserve"}');
  db.prepare("INSERT INTO identity_grants VALUES('p','drive')").run();
  const store=new IdentityStore(path),server=createIdentityServer({store,clients:[],origin:'https://chufa.wang'});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const login=await store.login('person','Profile-Test-123'),cookie='chufa_session='+login.token;
  return {db,store,cookie,token:login.token,base:'http://127.0.0.1:'+server.address().port,
    close:async()=>{await new Promise(resolve=>server.close(resolve));store.close();db.close();rmSync(dir,{recursive:true,force:true});}};
}
const patch=(f,input,extra={})=>fetch(f.base+'/account/api/profile',{method:'PATCH',headers:{Origin:'https://chufa.wang','Content-Type':'application/json',Cookie:f.cookie,...extra},body:JSON.stringify(input)});

test('own profile is owner-bound and ordinary drive-only members can edit display name without changing authority',async()=>{
  const f=await fixture();try{
    assert.equal((await fetch(f.base+'/account/api/profile')).status,401);
    const response=await fetch(f.base+'/account/api/profile',{headers:{Cookie:f.cookie}}),{user}=await response.json();
    assert.equal(user.id,'p');assert.equal(user.displayName,'person');assert.equal(user.emailVerified,true);
    assert.deepEqual(Object.keys(user).sort(),['displayName','email','emailVerified','id','updatedAt','username']);
    const input={displayName:'旅行者 🌊',email:user.email,expectedUpdatedAt:user.updatedAt,currentPassword:''};
    for(const extra of [{id:'q'},{role:'admin'},{grants:['status']},{password:'New-Test-456'}])assert.equal((await patch(f,{...input,...extra})).status,400);
    assert.equal((await fetch(f.base+'/account/api/profile?id=q',{headers:{Cookie:f.cookie}})).status,400);
    const changed=await patch(f,input);assert.equal(changed.status,200);
    const result=(await changed.json()).user;assert.equal(result.displayName,input.displayName);assert.equal(result.emailVerified,true);
    assert.equal(f.db.prepare("SELECT role FROM users WHERE id='p'").get().role,'member');
    assert.deepEqual(f.store.session(f.token).user.grants,['drive']);
    assert.equal(JSON.parse(f.db.prepare("SELECT profile_json FROM users WHERE id='p'").get().profile_json).unrelatedPreference,'preserve');
    assert.equal(f.db.prepare("SELECT profile_json FROM users WHERE id='q'").get().profile_json,'{"unrelatedPreference":"preserve"}');
    assert.equal((await patch(f,input)).status,409);
  }finally{await f.close();}
});

test('email edits require fresh password confirmation, uniqueness and revision while retaining stable identity/session',async()=>{
  const f=await fixture();try{
    const user=f.store.ownProfile(f.token),input={displayName:'Person',email:'new@example.invalid',expectedUpdatedAt:user.updatedAt,currentPassword:''};
    assert.equal((await patch(f,input)).status,400);
    assert.equal((await patch(f,{...input,currentPassword:'wrong'})).status,401);
    assert.equal((await patch(f,{...input,email:'OTHER@example.invalid',currentPassword:'Profile-Test-123'})).status,409);
    const success=await patch(f,{...input,email:' NEW@Example.invalid ',currentPassword:'Profile-Test-123'});
    assert.equal(success.status,200);const next=(await success.json()).user;
    assert.equal(next.id,'p');assert.equal(next.username,'person');assert.equal(next.email,'new@example.invalid');assert.equal(next.emailVerified,false);
    assert.equal(f.store.session(f.token).user.id,'p');
    assert.equal((await f.store.login('new@example.invalid','Profile-Test-123')).user.id,'p');
    assert.equal(await f.store.login('person@example.invalid','Profile-Test-123'),null);
    const audit=JSON.stringify(f.db.prepare('SELECT * FROM identity_profile_events').all());
    assert.ok(!audit.includes('Profile-Test-123'));assert.ok(!audit.includes('new@example.invalid'));
    assert.equal((await patch(f,{...input,currentPassword:'Profile-Test-123'})).status,409);
  }finally{await f.close();}
});

test('profile writes reject CSRF, forced changes and malformed data without mutating other identity fields',async()=>{
  const f=await fixture();try{
    const user=f.store.ownProfile(f.token),input={displayName:'Person',email:user.email,expectedUpdatedAt:user.updatedAt,currentPassword:''};
    assert.equal((await patch(f,input,{Origin:'https://evil.invalid'})).status,403);
    assert.equal((await fetch(f.base+'/account/api/profile',{method:'POST',headers:{Cookie:f.cookie}})).status,405);
    for(const extra of [{displayName:''},{displayName:'x'.repeat(81)},{displayName:'bad\nname'},{email:'invalid'},{expectedUpdatedAt:1}])assert.equal((await patch(f,{...input,...extra})).status,400);
    f.db.prepare("UPDATE users SET password_change_required=1 WHERE id='p'").run();assert.equal((await patch(f,input)).status,403);
    assert.equal(f.store.ownProfile(f.token).displayName,'person');
  }finally{await f.close();}
});

test('session revocation during password verification and audit failures roll back own profile changes',async()=>{
  const f=await fixture();try{
    const user=f.store.ownProfile(f.token),input={displayName:'Changed',email:'changed@example.invalid',expectedUpdatedAt:user.updatedAt,currentPassword:'Profile-Test-123'};
    const pending=f.store.updateOwnProfile(f.token,input);f.store.logout(f.token);
    await assert.rejects(pending,error=>error.code==='AUTH_REQUIRED');
    const second=await f.store.login('person','Profile-Test-123');
    f.db.exec('DROP TABLE identity_profile_events');
    await assert.rejects(f.store.updateOwnProfile(second.token,{...input,email:user.email,currentPassword:''}));
    assert.equal(f.store.ownProfile(second.token).displayName,'person');assert.equal(f.store.ownProfile(second.token).email,user.email);
  }finally{await f.close();}
});
