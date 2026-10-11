import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { IdentityStore } from './store.mjs';

export function cookieToken(header='') {
  const values=header.split(';').map(v=>v.trim()).filter(v=>v.startsWith('chufa_session='));
  if(values.length!==1) return null;
  const value=values[0].slice('chufa_session='.length);
  return /^[A-Za-z0-9_-]{43}$/.test(value)?value:null;
}
const cookie=(token,age=604800)=>`chufa_session=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${age}`;
function equal(a,b) {const x=Buffer.from(a||''),y=Buffer.from(b||'');return x.length===y.length && x.length>=32 && timingSafeEqual(x,y);}
export function createIdentityServer({store,clients,origin='https://chufa.wang'}) {
  const failures=new Map();
  let inFlight=0;
  const write=(res,status,body,headers={})=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers});res.end(JSON.stringify(body));};
  return createServer(async(req,res)=>{
    try {
      const url=new URL(req.url,'http://localhost');
      const token=cookieToken(req.headers.cookie);
      if(url.pathname.startsWith('/internal/')) {
        const client=clients.find(c=>equal(req.headers.authorization,`Bearer ${c.token}`));
        const service=url.searchParams.get('service');
        if(!client || !client.services.includes(service)) return write(res,403,{code:'FORBIDDEN'});
        const originalMethod=req.headers['x-original-method'];
        if(client.requireOriginalMethod && !/^[A-Z]+$/.test(originalMethod||'')) return write(res,403,{code:'INVALID_ORIGINAL_METHOD'});
        if(originalMethod && !['GET','HEAD','OPTIONS'].includes(originalMethod)
          && (req.headers.origin!==origin || req.headers['sec-fetch-site']==='cross-site')) return write(res,403,{code:'INVALID_ORIGIN'});
        const session=store.session(token);
        if(!session) return write(res,401,{code:'AUTH_REQUIRED'});
        if(!store.authorized(session,service)) return write(res,403,{code:session.user.passwordChangeRequired?'PASSWORD_CHANGE_REQUIRED':'ACCESS_DENIED'});
        if(req.method!=='GET') return write(res,405,{code:'METHOD'});
        if(url.pathname==='/internal/check') {
          res.writeHead(204,{'Cache-Control':'no-store','X-Identity-User':session.user.username});return res.end();
        }
        if(url.pathname==='/internal/session') return write(res,200,session);
        return write(res,404,{code:'NOT_FOUND'});
      }
      if(req.method==='GET' && (url.pathname==='/account/' || url.pathname==='/account/app.js' || url.pathname==='/account/style.css')) {
        const file=url.pathname==='/account/'?'index.html':url.pathname.split('/').pop();
        res.writeHead(200,{'Content-Type':file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html; charset=utf-8',
          'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer',
          'Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"});
        return res.end(readFileSync(new URL(`../public/${file}`,import.meta.url)));
      }
      if(req.method==='GET' && url.pathname==='/account/api/session') return write(res,200,{authenticated:!!store.session(token),user:store.session(token)?.user??null});
      if(req.method!=='POST' || !['/account/api/login','/account/api/logout','/account/api/password'].includes(url.pathname)) return write(res,404,{code:'NOT_FOUND'});
      if(req.headers.origin!==origin || req.headers['sec-fetch-site']==='cross-site' || !req.headers['content-type']?.startsWith('application/json')) return write(res,403,{code:'INVALID_ORIGIN'});
      let body='',bytes=0;
      for await(const chunk of req) {bytes+=chunk.length;if(bytes>8192){write(res,413,{code:'BODY_TOO_LARGE'});return;}body+=chunk;}
      let input;try{input=JSON.parse(body);}catch{return write(res,400,{code:'INVALID_JSON'});}
      if(!input || typeof input!=='object' || Array.isArray(input)) return write(res,400,{code:'INVALID_JSON'});
      if(url.pathname.endsWith('/logout')) {store.logout(token);return write(res,200,{ok:true},{'Set-Cookie':cookie('',0)});}
      const ip=String(req.headers['x-real-ip']||req.socket.remoteAddress||'unknown').slice(0,64);
      const account=String(input.identifier||store.session(token)?.user.id||'').trim().normalize('NFC').toLowerCase().slice(0,320);
      const keys=[`ip:${ip}`,`user:${account}`],stamp=Date.now();
      for(const [k,v] of failures) if(v.until<=stamp) failures.delete(k);
      if(keys.some(k=>(failures.get(k)?.count??0)>=8) || failures.size>5000) return write(res,429,{code:'RATE_LIMITED'});
      // Reserve before awaiting scrypt, including concurrent requests.
      for(const k of keys) {const old=failures.get(k);failures.set(k,{count:(old?.count??0)+1,until:old?.until??stamp+15*60000});}
      if(inFlight>=2)return write(res,429,{code:'RATE_LIMITED'});
      inFlight++;
      try {
      if(url.pathname.endsWith('/password')) {
        if(!await store.changePassword(token,input.current,input.next)) return write(res,400,{code:'PASSWORD_CHANGE_FAILED'});
        keys.forEach(k=>failures.delete(k));return write(res,200,{ok:true});
      }
      const result=await store.login(input.identifier,input.password);
      if(!result) return write(res,401,{code:'BAD_CREDENTIALS'});
      keys.forEach(k=>failures.delete(k));
      return write(res,200,{authenticated:true,user:result.user},{'Set-Cookie':cookie(result.token)});
      } finally {inFlight--;}
    }catch {if(!res.headersSent)write(res,503,{code:'IDENTITY_UNAVAILABLE'});else res.destroy();}
  });
}
if(process.argv[1]===fileURLToPath(import.meta.url)) {
  const config=JSON.parse(readFileSync(process.env.CHUFA_IDENTITY_CONFIG,'utf8'));
  const store=new IdentityStore(config.database);
  createIdentityServer({store,clients:config.clients}).listen(4193,'127.0.0.1');
}
