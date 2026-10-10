import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp,writeFile,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp,loadConfig } from '../server/app.mjs';

test('unified Drive uses central identity and never falls back to legacy login',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'drive-identity-'));
 let status=200,calls=0;
 const token='s'.repeat(43),clientToken='c'.repeat(48);
 const authority=createServer((req,res)=>{
  calls++;assert.equal(req.headers.authorization,`Bearer ${clientToken}`);assert.equal(req.url,'/internal/session?service=drive');
  assert.equal(req.headers.cookie,`chufa_session=${token}`);
  res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(status===200?{sessionId:'session',expiresAt:new Date(Date.now()+60000).toISOString(),user:{id:'person',username:'preview'}}:{code:'REJECTED'}));
 });
 await new Promise(r=>authority.listen(0,'127.0.0.1',r));
 const configFile=join(dir,'client.json');
 await writeFile(configFile,JSON.stringify({url:`http://127.0.0.1:${authority.address().port}`,token:clientToken}));
 const app=await createApp(loadConfig({DRIVE_IDENTITY_CONFIG:configFile,DRIVE_DATA_DIR:join(dir,'data'),DRIVE_STATE_DIR:join(dir,'state'),DRIVE_STATIC_DIR:join(dir,'dist')}));
 await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
 const base=`http://127.0.0.1:${app.server.address().port}/drive/api`;
 try{
  assert.deepEqual(await(await fetch(base+'/auth-mode')).json(),{unified:true});
  assert.equal((await fetch(base+'/session',{headers:{Cookie:'drive_sid=legacy'}})).status,401);
  assert.equal(calls,0,'legacy cookie must not be sent to the authority');
  const headers={Cookie:`chufa_session=${token}`};
  assert.deepEqual(await(await fetch(base+'/session',{headers})).json(),{user:'preview'});
  assert.equal((await fetch(base+'/list',{headers})).status,200);
  assert.equal((await fetch(base+'/login',{method:'POST',headers:{'Content-Type':'application/json','X-Drive-Request':'1'},body:JSON.stringify({username:'admin',password:'old'})})).status,409);
  status=401;assert.equal((await fetch(base+'/list',{headers})).status,401);
  status=403;assert.equal((await fetch(base+'/list',{headers})).status,403);
  status=503;assert.equal((await fetch(base+'/list',{headers})).status,503);
 }finally{
  await new Promise(r=>app.server.close(r));await new Promise(r=>authority.close(r));await rm(dir,{recursive:true,force:true});
 }
});
