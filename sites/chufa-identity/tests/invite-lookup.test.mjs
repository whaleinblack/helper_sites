import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {IdentityStore} from '../server/store.mjs';
import {createIdentityServer} from '../server/server.mjs';

async function fixture(){
  const dir=mkdtempSync(join(tmpdir(),'chufa-invite-')),db=new DatabaseSync(join(dir,'identity.sqlite'));
  db.exec(`CREATE TABLE identity_meta(id INTEGER PRIMARY KEY,version INTEGER);INSERT INTO identity_meta VALUES(1,1);
    CREATE TABLE users(id TEXT PRIMARY KEY,username TEXT,email TEXT,role TEXT,status TEXT,password_change_required INTEGER,profile_json TEXT);
    CREATE TABLE identity_grants(user_id TEXT,service TEXT,PRIMARY KEY(user_id,service));`);
  for(const [id,username,status,pw,grant] of [['u1','Member','active',0,true],['u2','Disabled','disabled',0,true],['u3','NoAccess','active',0,false],['u4','FirstLogin','active',1,true]]){
    db.prepare("INSERT INTO users VALUES(?,?,?,'member',?,?,?)").run(id,username,id+'@example.invalid',status,pw,'{"displayName":"nickname"}');
    if(grant)db.prepare("INSERT INTO identity_grants VALUES(?,'agents')").run(id);
  }
  const store=new IdentityStore(join(dir,'identity.sqlite'));
  const server=createIdentityServer({store,clients:[
    {token:'i'.repeat(48),services:['agents'],userLookup:true,inviteLookup:true},
    {token:'a'.repeat(48),services:['agents'],userLookup:true},
    {token:'d'.repeat(48),services:['drive'],userLookup:true,inviteLookup:true},
  ]});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base='http://127.0.0.1:'+server.address().port;
  const request=(query,token='i',method='GET')=>fetch(base+'/internal/user?service=agents&purpose=project-invite&'+query,{method,headers:{Authorization:'Bearer '+token.repeat(48)}});
  return {db,store,request,base,close:async()=>{await new Promise(resolve=>server.close(resolve));store.close();db.close();rmSync(dir,{recursive:true,force:true});}};
}

test('invitation reasons require dedicated agents client scopes before any target lookup',async()=>{
  const f=await fixture();try{
    let calls=0;const original=f.store.inviteeEligibility.bind(f.store);f.store.inviteeEligibility=input=>{calls++;return original(input);};
    for(const token of ['a','d','x'])for(const target of ['Member','Missing']){
      const response=await f.request('username='+target,token);assert.equal(response.status,403);assert.deepEqual(await response.json(),{code:'CLIENT_SCOPE_REQUIRED'});
    }
    assert.equal(calls,0);
    assert.equal((await f.request('username=Member','i','POST')).status,405);
  }finally{await f.close();}
});

test('exact invitation lookup separates absence, service access, disabled and required password change',async()=>{
  const f=await fixture();try{
    for(const [name,status,code] of [['Missing',404,'USER_NOT_FOUND'],['NoAccess',403,'APP_ACCESS_REQUIRED'],['Disabled',403,'ACCOUNT_DISABLED'],['FirstLogin',403,'PASSWORD_CHANGE_REQUIRED'],['nickname',404,'USER_NOT_FOUND'],['u1@example.invalid',404,'USER_NOT_FOUND']]){
      const response=await f.request('username='+name);assert.equal(response.status,status,name);assert.deepEqual(await response.json(),{code});
    }
    for(const query of ['username=member','id=u1']){
      const response=await f.request(query);assert.equal(response.status,200);assert.deepEqual(await response.json(),{user:{id:'u1',username:'Member',role:'member'}});
    }
    assert.equal((await f.request('id=U1')).status,404);
  }finally{await f.close();}
});

test('eligibility uses current authority without cache or writes and ordinary lookup remains fail closed',async()=>{
  const f=await fixture();try{
    const count=()=>f.db.prepare('SELECT total_changes() AS n').get().n;
    const before=count();assert.equal((await f.request('id=u1')).status,200);assert.equal(count(),before);
    f.db.prepare("DELETE FROM identity_grants WHERE user_id='u1'").run();assert.equal((await(await f.request('id=u1')).json()).code,'APP_ACCESS_REQUIRED');
    f.db.prepare("INSERT INTO identity_grants VALUES('u1','agents')").run();assert.equal((await f.request('id=u1')).status,200);
    const legacy=await fetch(f.base+'/internal/user?service=agents&username=FirstLogin',{headers:{Authorization:'Bearer '+'a'.repeat(48)}});
    assert.equal(legacy.status,404);assert.deepEqual(await legacy.json(),{code:'USER_UNAVAILABLE'});
    f.db.prepare("UPDATE users SET password_change_required=0 WHERE id='u4'").run();assert.equal((await f.request('id=u4')).status,200);
  }finally{await f.close();}
});

test('bulk, ambiguous, duplicate and unknown-purpose requests cannot enumerate targets',async()=>{
  const f=await fixture();try{
    for(const query of ['', 'username=Member&id=u1','username=Member&username=Missing','username=Member&email=x','username=Member&purpose=other','id=']){
      const response=await f.request(query);assert.equal(response.status,400,query);assert.deepEqual(await response.json(),{code:'USER_LOOKUP_INVALID'});
    }
  }finally{await f.close();}
});
