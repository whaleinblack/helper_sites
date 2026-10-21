const $=id=>document.getElementById(id);
const routes={agents:['Agent 协作平台','/agents/'],production:['旅行规划','/travel/'],development:['开发站旅行规划','/travel_dev/'],drive:['我的网盘','/drive/'],status:['运维后台','/status/'], 'photo-admin':['摄影管理','/photo/status/'],'live-admin':['直播管理','/live/status/']};
const adminOnly=new Set(['status','photo-admin','live-admin']);
// Return-to paths by service; the first (most specific) prefix wins, `/` itself is the travel planner.
const returnPrefixes=[['/travel_dev/status/','status'],['/dev/status/','status'],['/photo/status/','photo-admin'],['/live/status/','live-admin'],['/status/','status'],['/agents/','agents'],['/drive/','drive'],['/travel_dev/','development'],['/travel/','production'],['/dev/','development']];
const errors={BAD_CREDENTIALS:'账号或密码不正确，请使用你的出发网统一账号。',RATE_LIMITED:'尝试次数过多，请稍后再试。',PASSWORD_CHANGE_FAILED:'修改未成功，请核对当前密码与新密码要求。',IDENTITY_UNAVAILABLE:'账号服务暂时不可用，请稍后重试。',
  USERNAME_INVALID:'用户名需为 3–32 位英文字母、数字或 . _ -，并以字母或数字开头。',EMAIL_INVALID:'邮箱格式不正确，请检查后重试。',PASSWORD_WEAK:'密码至少 8 个字符，并包含大写字母、小写字母、数字、符号中的任意三类。',
  ACCOUNT_EXISTS:'该用户名或邮箱已被注册，请直接登录，或换一个用户名 / 邮箱。',REGISTRATION_INVALID:'注册信息不完整，请刷新页面后重试。',INVALID_ORIGIN:'请求来源无效，请从出发网页面重新打开账户页。'};
const params=new URLSearchParams(location.search);
let current=null,registrationAvailable=false;
async function api(path,body){const r=await fetch('/account/api/'+path,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});const v=await r.json().catch(()=>({}));if(!r.ok)throw Error(errors[v.code]||'暂时无法完成操作，请重试。');return v;}
function canUse(user,scope){return !user.passwordChangeRequired&&user.grants.includes(scope)&&(!adminOnly.has(scope)||user.role==='admin');}
function show(user){current=user;$('guest').hidden=!!user;$('signed').hidden=!user;if(!user)return;$('identity').textContent=`已登录 · ${user.username}`;$('services').replaceChildren();if(user.passwordChangeRequired){$('message').textContent='请先修改临时密码，再访问其他服务。';$('signed').querySelector('details').open=true;return;}for(const scope of Object.keys(routes)){if(!canUse(user,scope))continue;const a=document.createElement('a');[a.textContent,a.href]=routes[scope];$('services').append(a);}}
function setMode(mode){const register=mode==='register'&&registrationAvailable;$('tab-register').hidden=!registrationAvailable;$('tab-login').setAttribute('aria-selected',String(!register));$('tab-register').setAttribute('aria-selected',String(register));$('login').hidden=register;$('register').hidden=!register;}
// Only same-origin service paths are honoured; anything else stays on this page.
function requestedReturn(){const next=params.get('next');if(!next)return null;if(!next.startsWith('/')||next.startsWith('//')||/[\\\u0000-\u001f]/.test(next))return {invalid:true};
  const target=new URL(next,location.origin);if(target.origin!==location.origin||target.pathname.startsWith('/account/'))return {invalid:true};
  const scope=target.pathname==='/'?'home':returnPrefixes.find(([base])=>target.pathname.startsWith(base))?.[1];return scope?{scope,href:target.pathname+target.search+target.hash}:{invalid:true};}
// Never bounce back to a service the account cannot use: that service would send the visitor here again.
function returnToService(){const target=requestedReturn();if(!target||!current||current.passwordChangeRequired)return;
  if(target.invalid){$('message').textContent='返回地址不属于出发网服务，已停留在账户页面。';return;}
  if(target.scope==='home'||canUse(current,target.scope)){location.assign(target.href);return;}
  $('message').textContent=`当前账号尚未开通「${routes[target.scope][0]}」，下方列出了可以进入的服务。如需开通，请联系管理员。`;}
function registrationProblem(input){if(!/^[A-Za-z0-9][A-Za-z0-9._-]{2,31}$/.test(input.username.trim()))return errors.USERNAME_INVALID;if(input.email.trim().length>254||!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(input.email.trim()))return errors.EMAIL_INVALID;
  const p=input.password;if([...p].length<8||new TextEncoder().encode(p).length>256||[/[a-z]/,/[A-Z]/,/[0-9]/,/[^A-Za-z0-9]/].filter(x=>x.test(p)).length<3)return errors.PASSWORD_WEAK;return null;}
$('tab-login').addEventListener('click',()=>setMode('login'));$('tab-register').addEventListener('click',()=>setMode('register'));
for(const id of ['login','register','password'])$(id).addEventListener('submit',async e=>{e.preventDefault();const form=e.target,button=form.querySelector('button'),input=Object.fromEntries(new FormData(form));$('message').textContent='';
  if(id==='register'){const problem=registrationProblem(input);if(problem){$('message').textContent=problem;return;}input.username=input.username.trim();input.email=input.email.trim();}
  button.disabled=true;
  try{const v=await api(id,input);form.reset();if(id==='password'){show((await api('session')).user);$('message').textContent='密码已更新，其他设备的旧登录已退出。';return;}
    show(v.user);if(id==='register')$('message').textContent='注册成功，已登录。';returnToService();}
  catch(err){$('message').textContent=err.message;for(const field of form.querySelectorAll('input[type=password]'))field.value='';}
  finally{button.disabled=false;}});
$('logout').addEventListener('click',async()=>{try{await api('logout',{});show(null);setMode('login');$('message').textContent='已退出登录。';}catch(err){$('message').textContent=err.message;}});
api('session').then(v=>{registrationAvailable=v.registrationAvailable===true;show(v.user);if(!v.user)setMode(params.get('mode'));returnToService();}).catch(e=>{$('message').textContent=e.message;$('guest').hidden=false;setMode('login');});
