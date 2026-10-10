import { readFileSync } from 'node:fs';
import { HttpError } from './util.mjs';

// The Drive stores no password or independent session when unified identity is enabled.
export class UnifiedIdentityClient {
  constructor(config) {
    const value=JSON.parse(readFileSync(config.identityConfig,'utf8'));
    const url=new URL(value.url);
    if(url.protocol!=='http:' || url.hostname!=='127.0.0.1' || !/^[A-Za-z0-9_-]{40,}$/.test(value.token)) throw Error('Invalid identity client configuration');
    this.base=url.origin;this.token=value.token;
  }
  async load() {}
  async resolve(token) {
    if(!/^[A-Za-z0-9_-]{43}$/.test(token||''))return null;
    let r;
    try {r=await fetch(`${this.base}/internal/session?service=drive`,{headers:{Authorization:`Bearer ${this.token}`,Cookie:`chufa_session=${token}`},signal:AbortSignal.timeout(3000),redirect:'error'});}
    catch {throw new HttpError(503,'IDENTITY_UNAVAILABLE','账号服务暂时不可用，请稍后重试');}
    if(r.status===401)return null;
    if(r.status===403)throw new HttpError(403,'IDENTITY_ACCESS_DENIED','统一账号尚未获准使用网盘，或需要先修改密码');
    if(!r.ok)throw new HttpError(503,'IDENTITY_UNAVAILABLE','账号服务暂时不可用，请稍后重试');
    const value=await r.json();
    if(!value.user?.id || typeof value.user.username!=='string')throw Error('Invalid identity response');
    return {id:value.sessionId,user:value.user.username,identityId:value.user.id,expires:Date.parse(value.expiresAt),remember:false};
  }
  async save() {}
}
