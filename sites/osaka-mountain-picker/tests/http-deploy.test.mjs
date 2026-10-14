import assert from 'node:assert/strict';
import test from 'node:test';
import { validateDeployMetadata, validateOidcClaims, validateTarEntries } from '../ops/http-deploy/outdoor-deployd.mjs';

test('HTTP deploy metadata requires immutable hashes and bounded request ids', () => {
  const valid={commit:'a'.repeat(40),sha256:'b'.repeat(64),requestId:'deploy_123_safe'};
  assert.deepEqual(validateDeployMetadata(valid),valid);
  assert.throws(()=>validateDeployMetadata({...valid,commit:'main'}),/commit/);
  assert.throws(()=>validateDeployMetadata({...valid,sha256:'b'.repeat(63)}),/checksum/);
  assert.throws(()=>validateDeployMetadata({...valid,requestId:'../escape'}),/request id/);
});

test('HTTP deploy artifact rejects traversal and links', () => {
  const valid=['./','./site/','./site/index.html','./site/assets/app.js','./weather/','./weather/weather-api.mjs'];
  assert.equal(validateTarEntries(valid,['-rw-r--r-- site/index.html']),true);
  assert.throws(()=>validateTarEntries([...valid,'../escape']),/unsafe/);
  assert.throws(()=>validateTarEntries(valid,['lrwxrwxrwx site/index.html -> /etc/passwd']),/links/);
  assert.throws(()=>validateTarEntries(['./site/assets/app.js']),/static site/);
});

test('HTTP deploy accepts only the pinned GitHub workflow identity', () => {
  const now=2_000_000_000;
  const valid={
    iss:'https://token.actions.githubusercontent.com',
    aud:'osaka-mountain-outdoor-deploy',
    repository:'whaleinblack/chufa.wang',
    ref:'refs/heads/main',
    workflow_ref:'whaleinblack/chufa.wang/.github/workflows/deploy-outdoor.yml@refs/heads/main',
    event_name:'workflow_dispatch',
    exp:now+300,
    nbf:now-10,
  };
  assert.equal(validateOidcClaims(valid,now),valid);
  assert.throws(()=>validateOidcClaims({...valid,repository:'someone/fork'},now),/repository/);
  assert.throws(()=>validateOidcClaims({...valid,ref:'refs/heads/dev'},now),/ref/);
  assert.throws(()=>validateOidcClaims({...valid,exp:now-60},now),/expired/);
});
