const $=id=>document.getElementById(id);
// Display language and colour mode follow the travel planner's same-origin preferences (planner-locale / planner-color-mode).
const STRINGS={
  'zh-CN':{homeLabel:'出发网主页',languageLabel:'显示语言',badge:'出发网账号',titleGuest:'登录或注册出发网账号',titleSigned:'你的出发网账号',
    introGuest:'旅行、网盘与管理工具共用一套登录身份。注册只需用户名、邮箱和密码。',introSigned:'旅行、网盘与管理工具都使用这一套登录身份。',tabsLabel:'登录或注册',tabLogin:'登录',tabRegister:'注册',
    fieldIdentifier:'邮箱 / 用户名',fieldPassword:'密码',placeholderIdentifier:'请输入邮箱或用户名',placeholderPassword:'请输入密码',buttonLogin:'登录',
    fieldUsername:'用户名',fieldEmail:'邮箱',placeholderUsername:'3–32 位字母、数字或 . _ -',placeholderNewPassword:'至少 8 个字符',
    ruleUsername:'用户名 3–32 位，只用英文字母、数字或 . _ -，并以字母或数字开头。',
    rulePassword:'密码至少 8 个字符，包含大写字母、小写字母、数字、符号中的任意三类。',
    ruleGrants:'注册后默认开通旅行规划；网盘、开发站和管理工具需管理员另行开通。邮箱暂不验证。',buttonRegister:'注册并登录',
    servicesTitle:'可以进入的服务',passwordSummary:'修改统一账号密码',fieldCurrentPassword:'当前密码',fieldNewPassword:'新密码',
    passwordHint:'至少 8 个字符，包含大小写字母、数字、符号中的三种。',buttonSavePassword:'保存新密码',buttonLogout:'退出所有站点的当前登录',backHome:'返回出发网主页',
    signedAs:'已登录 · {name}',forcedChange:'请先修改临时密码，再访问其他服务。',invalidReturn:'返回地址不属于出发网服务，已停留在账户页面。',
    noGrant:'当前账号尚未开通「{service}」，下方列出了可以进入的服务。如需开通，请联系管理员。',passwordUpdated:'密码已更新，其他设备的旧登录已退出。',
    registered:'注册成功，已登录。',loggedOut:'已退出登录。',noServices:'暂未开通任何服务，请联系管理员。',generic:'暂时无法完成操作，请重试。',
    services:{mountain:'登山地图',camp:'星野露营',agents:'Agent 协作平台',production:'旅行规划',development:'开发站旅行规划',drive:'我的网盘',status:'运维后台','photo-admin':'摄影管理','live-admin':'直播管理'},
    errors:{BAD_CREDENTIALS:'账号或密码不正确，请使用你的出发网统一账号。',RATE_LIMITED:'尝试次数过多，请稍后再试。',PASSWORD_CHANGE_FAILED:'修改未成功，请核对当前密码与新密码要求。',IDENTITY_UNAVAILABLE:'账号服务暂时不可用，请稍后重试。',
      USERNAME_INVALID:'用户名需为 3–32 位英文字母、数字或 . _ -，并以字母或数字开头。',EMAIL_INVALID:'邮箱格式不正确，请检查后重试。',PASSWORD_WEAK:'密码至少 8 个字符，并包含大写字母、小写字母、数字、符号中的任意三类。',
      ACCOUNT_EXISTS:'该用户名或邮箱已被注册，请直接登录，或换一个用户名 / 邮箱。',REGISTRATION_INVALID:'注册信息不完整，请刷新页面后重试。',INVALID_ORIGIN:'请求来源无效，请从出发网页面重新打开账户页。'}},
  'en-US':{homeLabel:'Chufa home',languageLabel:'Display language',badge:'CHUFA ACCOUNT',titleGuest:'Sign in or create your Chufa account',titleSigned:'Your Chufa account',
    introGuest:'Travel planning, Drive and admin tools share one sign-in. Registration only needs a username, email and password.',introSigned:'Travel planning, Drive and admin tools all use this one sign-in.',tabsLabel:'Sign in or register',tabLogin:'Sign in',tabRegister:'Register',
    fieldIdentifier:'Email / Username',fieldPassword:'Password',placeholderIdentifier:'Enter your email or username',placeholderPassword:'Enter your password',buttonLogin:'Sign in',
    fieldUsername:'Username',fieldEmail:'Email',placeholderUsername:'3–32 letters, digits or . _ -',placeholderNewPassword:'At least 8 characters',
    ruleUsername:'Usernames are 3–32 characters: letters, digits or . _ -, starting with a letter or digit.',
    rulePassword:'Passwords need at least 8 characters with three of: uppercase, lowercase, digits, symbols.',
    ruleGrants:'New accounts get Travel Planner. Drive, the preview site and admin tools are enabled by an administrator. Email is not verified yet.',buttonRegister:'Register and sign in',
    servicesTitle:'Services you can open',passwordSummary:'Change account password',fieldCurrentPassword:'Current password',fieldNewPassword:'New password',
    passwordHint:'At least 8 characters with three of: uppercase, lowercase, digits, symbols.',buttonSavePassword:'Save new password',buttonLogout:'Sign out on all Chufa sites',backHome:'Back to Chufa home',
    signedAs:'Signed in · {name}',forcedChange:'Change your temporary password before using other services.',invalidReturn:'The return address is not a Chufa service, so you stay on the account page.',
    noGrant:'This account does not have access to “{service}” yet. Services you can open are listed below; ask an administrator for access.',passwordUpdated:'Password updated. Older sign-ins on other devices were signed out.',
    registered:'Registration complete. You are signed in.',loggedOut:'Signed out.',noServices:'No services are enabled for this account yet. Ask an administrator.',generic:'Something went wrong. Please try again.',
    services:{mountain:'Mountain map',camp:'Stargazing and camping',agents:'Agent workspace',production:'Travel Planner',development:'Travel Planner (preview)',drive:'Drive',status:'Operations console','photo-admin':'Photo admin','live-admin':'Live admin'},
    errors:{BAD_CREDENTIALS:'Incorrect account or password. Use your Chufa account.',RATE_LIMITED:'Too many attempts. Please try again later.',PASSWORD_CHANGE_FAILED:'Password not changed. Check your current password and the new password rules.',IDENTITY_UNAVAILABLE:'The account service is temporarily unavailable. Please try again.',
      USERNAME_INVALID:'Usernames are 3–32 letters, digits or . _ -, starting with a letter or digit.',EMAIL_INVALID:'That email address does not look right.',PASSWORD_WEAK:'Use at least 8 characters with three of: uppercase, lowercase, digits, symbols.',
      ACCOUNT_EXISTS:'That username or email is already registered. Sign in, or choose another username / email.',REGISTRATION_INVALID:'Registration details are incomplete. Refresh the page and try again.',INVALID_ORIGIN:'Invalid request origin. Reopen the account page from a Chufa page.'}},
};
function pref(key){try{return localStorage.getItem(key);}catch{return null;}}
function setPref(key,value){try{localStorage.setItem(key,value);}catch{}}
let locale=pref('planner-locale-source')==='manual'&&pref('planner-locale')==='en-US'?'en-US':'zh-CN';
const t=(key,vars={})=>String(STRINGS[locale][key]??STRINGS['zh-CN'][key]??'').replace(/\{(\w+)\}/g,(_,name)=>vars[name]??'');
const routes={mountain:'/mountain/',camp:'/camp/',agents:'/agents/',production:'/travel/',development:'/travel_dev/',drive:'/drive/',status:'/status/','photo-admin':'/photo/status/','live-admin':'/live/status/'};
const serviceName=scope=>STRINGS[locale].services[scope];
const adminOnly=new Set(['status','photo-admin','live-admin']);
// Return-to paths by service; the first (most specific) prefix wins, `/` itself is the travel planner.
const returnPrefixes=[['/mountain/','mountain'],['/camp/','camp'],['/travel_dev/status/','status'],['/dev/status/','status'],['/photo/status/','photo-admin'],['/live/status/','live-admin'],['/status/','status'],['/agents/','agents'],['/drive/','drive'],['/travel_dev/','development'],['/travel/','production'],['/dev/','development']];
let errors=STRINGS[locale].errors;
const params=new URLSearchParams(location.search);
let current=null,registrationAvailable=false;
function applyTheme(){try{const root=document.documentElement,mode=pref('planner-color-mode');
  if(pref('planner-color-mode-source')==='manual'&&(mode==='light'||mode==='dark'))root.dataset.plannerTheme=mode;else delete root.dataset.plannerTheme;}catch{}}
// Static copy lives in the markup (Chinese) and is swapped in place; the page still reads correctly if this never runs.
function heading(){$('auth-title').textContent=t(current?'titleSigned':'titleGuest');$('auth-intro').textContent=t(current?'introSigned':'introGuest');}
function applyLocale(){errors=STRINGS[locale].errors;heading();$('lang-zh').setAttribute('aria-pressed',String(locale==='zh-CN'));$('lang-en').setAttribute('aria-pressed',String(locale==='en-US'));
  if(!document.querySelectorAll)return;document.documentElement.lang=locale;document.title=locale==='en-US'?'Chufa · Account':'出发网 · 统一账户';
  for(const node of document.querySelectorAll('[data-i18n]'))node.textContent=t(node.dataset.i18n);
  for(const node of document.querySelectorAll('[data-i18n-placeholder]'))node.placeholder=t(node.dataset.i18nPlaceholder);
  for(const node of document.querySelectorAll('[data-i18n-label]'))node.setAttribute('aria-label',t(node.dataset.i18nLabel));}
function setLocale(next){if(next===locale)return;locale=next;setPref('planner-locale',next);setPref('planner-locale-source','manual');applyLocale();show(current);}
async function api(path,body){const r=await fetch('/account/api/'+path,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});const v=await r.json().catch(()=>({}));if(!r.ok)throw Error(errors[v.code]||t('generic'));return v;}
function canUse(user,scope){return !user.passwordChangeRequired&&user.grants.includes(scope)&&(!adminOnly.has(scope)||user.role==='admin');}
function show(user){current=user;$('guest').hidden=!!user;$('signed').hidden=!user;heading();if(!user)return;$('identity').textContent=t('signedAs',{name:user.username});$('services').replaceChildren();if(user.passwordChangeRequired){$('message').textContent=t('forcedChange');$('signed').querySelector('details').open=true;return;}
  for(const scope of Object.keys(routes)){if(!canUse(user,scope))continue;const a=document.createElement('a');a.className='service-link';[a.textContent,a.href]=[serviceName(scope),routes[scope]];$('services').append(a);}
  if(!Object.keys(routes).some(scope=>canUse(user,scope))){const empty=document.createElement('p');empty.className='services-empty';empty.textContent=t('noServices');$('services').append(empty);}}
function setMode(mode){const register=mode==='register'&&registrationAvailable;$('tab-register').hidden=!registrationAvailable;$('tab-login').setAttribute('aria-selected',String(!register));$('tab-register').setAttribute('aria-selected',String(register));$('login').hidden=register;$('register').hidden=!register;}
// Only same-origin service paths are honoured; anything else stays on this page.
function requestedReturn(){const next=params.get('next');if(!next)return null;if(!next.startsWith('/')||next.startsWith('//')||/[\\\u0000-\u001f]/.test(next))return {invalid:true};
  const target=new URL(next,location.origin);if(target.origin!==location.origin||target.pathname.startsWith('/account/'))return {invalid:true};
  const scope=target.pathname==='/'?'home':returnPrefixes.find(([base])=>target.pathname.startsWith(base))?.[1];return scope?{scope,href:target.pathname+target.search+target.hash}:{invalid:true};}
// Never bounce back to a service the account cannot use: that service would send the visitor here again.
function returnToService(){const target=requestedReturn();if(!target||!current||current.passwordChangeRequired)return;
  if(target.invalid){$('message').textContent=t('invalidReturn');return;}
  if(target.scope==='home'||canUse(current,target.scope)){location.assign(target.href);return;}
  $('message').textContent=t('noGrant',{service:serviceName(target.scope)});}
function registrationProblem(input){if(!/^[A-Za-z0-9][A-Za-z0-9._-]{2,31}$/.test(input.username.trim()))return errors.USERNAME_INVALID;if(input.email.trim().length>254||!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(input.email.trim()))return errors.EMAIL_INVALID;
  const p=input.password;if([...p].length<8||new TextEncoder().encode(p).length>256||[/[a-z]/,/[A-Z]/,/[0-9]/,/[^A-Za-z0-9]/].filter(x=>x.test(p)).length<3)return errors.PASSWORD_WEAK;return null;}
applyTheme();applyLocale();
$('lang-zh').addEventListener('click',()=>setLocale('zh-CN'));$('lang-en').addEventListener('click',()=>setLocale('en-US'));
$('tab-login').addEventListener('click',()=>setMode('login'));$('tab-register').addEventListener('click',()=>setMode('register'));
for(const id of ['login','register','password'])$(id).addEventListener('submit',async e=>{e.preventDefault();const form=e.target,button=form.querySelector('button'),input=Object.fromEntries(new FormData(form));$('message').textContent='';
  if(id==='register'){const problem=registrationProblem(input);if(problem){$('message').textContent=problem;return;}input.username=input.username.trim();input.email=input.email.trim();}
  button.disabled=true;
  try{const v=await api(id,input);form.reset();if(id==='password'){show((await api('session')).user);$('message').textContent=t('passwordUpdated');return;}
    show(v.user);if(id==='register')$('message').textContent=t('registered');returnToService();}
  catch(err){$('message').textContent=err.message;for(const field of form.querySelectorAll('input[type=password]'))field.value='';}
  finally{button.disabled=false;}});
$('logout').addEventListener('click',async()=>{try{await api('logout',{});show(null);setMode('login');$('message').textContent=t('loggedOut');}catch(err){$('message').textContent=err.message;}});
api('session').then(v=>{registrationAvailable=v.registrationAvailable===true;show(v.user);if(!v.user)setMode(params.get('mode'));returnToService();}).catch(e=>{$('message').textContent=e.message;$('guest').hidden=false;setMode('login');});
