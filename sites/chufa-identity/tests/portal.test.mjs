import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

function portal(next){
  const elements=new Map(),redirects=[];
  const element=id=>{
    if(!elements.has(id))elements.set(id,{hidden:false,textContent:'',setAttribute(){},addEventListener(){},replaceChildren(){},append(){},querySelector(){return {open:false};}});
    return elements.get(id);
  };
  const context=vm.createContext({
    document:{getElementById:element,createElement:()=>({})},URL,URLSearchParams,TextEncoder,
    location:{origin:'https://chufa.wang',search:'?'+new URLSearchParams({next}),assign:path=>redirects.push(path)},
    fetch:async()=>({ok:true,json:async()=>({authenticated:false,user:null,registrationAvailable:true})}),
  });
  vm.runInContext(readFileSync(new URL('../public/app.js',import.meta.url),'utf8'),context);
  return {context,elements,redirects,enter(user){context.testUser=user;vm.runInContext('show(testUser);returnToService()',context);}};
}
const member={username:'synthetic',role:'member',passwordChangeRequired:false,grants:['production']};

test('account return paths support approved travel aliases while preserving deep-link query and hash',()=>{
  const p=portal('/travel/?project=synthetic#day2');p.enter(member);
  assert.deepEqual(p.redirects,['/travel/?project=synthetic#day2']);
  const dev=portal('/travel_dev/?project=synthetic');dev.enter({...member,grants:['development']});
  assert.deepEqual(dev.redirects,['/travel_dev/?project=synthetic']);
  const agents=portal('/agents/?pair=SYNTHETIC');agents.enter({...member,grants:['agents']});
  assert.deepEqual(agents.redirects,['/agents/?pair=SYNTHETIC']);
});

test('service grant, administrative role and forced password change all gate account return paths',()=>{
  for(const [path,user] of [
    ['/travel_dev/',member],['/status/',{...member,grants:['status']}],
    ['/travel_dev/status/',{...member,grants:['status']}],
    ['/travel/',{...member,passwordChangeRequired:true}],
  ]){
    const p=portal(path);p.enter(user);assert.deepEqual(p.redirects,[]);
  }
  const admin=portal('/status/users/');admin.enter({...member,role:'admin',grants:['status']});
  assert.deepEqual(admin.redirects,['/status/users/']);
});

test('external, credential-page, traversal and unknown return targets stay on the account portal',()=>{
  for(const path of ['//evil.invalid/','https://evil.invalid/','/\\evil.invalid/','/account/?mode=register','/travel/../account/','/unknown/']){
    const p=portal(path);p.enter(member);assert.deepEqual(p.redirects,[],path);
  }
});
