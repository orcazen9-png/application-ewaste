import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './helpers/market-fixture.mjs';
import {hash,hex,now} from '../server/accounts/common.js';
import {privateD1Bucket} from '../server/accounts/d1-storage.js';
import worker from '../server/worker.js';
const id=()=>crypto.randomUUID();
async function invite(f,actor,extra={}){
  const code='ewi_'+hex(crypto.getRandomValues(new Uint8Array(32)));
  await f.env.DB.prepare('INSERT INTO invitations(token_hash,actor,expires_at,revoked_at,created_at) VALUES(?,?,?,?,?)').bind(await hash(code),actor,extra.expires||new Date(Date.now()+3600000).toISOString(),extra.revoked||null,now()).run();return code;
}
function enable(f){f.env.INVITATIONS_ENABLED='true';f.env.AUTH_RATE_SECRET='test-rate-secret-with-32-characters';f.env.OPS_ENABLED='true';}
test('invitation redemption binds role, is single-use and rejects expiry and suspension',async t=>{
  const f=await fixture(t);enable(f);const c=await f.user(),r=await f.user('recycler');
  await f.env.DB.prepare('UPDATE users SET mobile=? WHERE id=?').bind('invited:'+c.id,c.id).run();
  const code=await invite(f,'user:'+c.id),input={code,role:'recycler'};
  const replies=await Promise.all([f.call(c,'/auth/invitation','POST',input),f.call(c,'/auth/invitation','POST',input)]);
  assert.deepEqual(replies.map(x=>x.status).sort(),[200,401]);const login=await replies.find(x=>x.status===200).json();assert.equal(login.user.role,'collector');assert.equal(login.user.mobile,'');assert.equal(login.user.identityMethod,'invitation');
  assert.equal((await f.ok({token:login.token},'/me')).user.id,c.id);
  for(const extra of [{expires:'2000-01-01T00:00:00Z'},{revoked:now()}])assert.equal((await f.call(c,'/auth/invitation','POST',{code:await invite(f,'user:'+r.id,extra)})).status,401);
  const suspended=await invite(f,'user:'+r.id);await f.env.DB.prepare("UPDATE users SET status='suspended' WHERE id=?").bind(r.id).run();assert.equal((await f.call(c,'/auth/invitation','POST',{code:suspended})).status,401);
  await f.ok({token:login.token},'/auth/logout','POST');assert.equal((await f.call({token:login.token},'/me')).status,401);
});
test('staff invitations cannot become user sessions; cookie requires same-origin writes and is revocable',async t=>{
  const f=await fixture(t);enable(f);const staff=id(),c=await f.user();
  await f.env.DB.prepare("INSERT INTO operations_staff VALUES(?,?,?,'Finance','finance','active',?)").bind(staff,'invite:'+staff,'finance@example.test',now()).run();
  const code=await invite(f,'staff:'+staff);
  const call=(path,method='GET',data,cookie='',origin='https://test.example')=>worker.fetch(new Request('https://test.example/api/ops'+path,{method,headers:{Cookie:cookie,Origin:origin,'Content-Type':'application/json'},...(method==='GET'?{}:{body:JSON.stringify(data||{})})}),f.env);
  assert.equal((await f.call(c,'/auth/invitation','POST',{code})).status,401);
  assert.equal((await call('/auth/invitation','POST',{code},'','https://evil.example')).status,403);
  const res=await call('/auth/invitation','POST',{code});assert.equal(res.status,200);const cookie=res.headers.get('Set-Cookie');assert.match(cookie,/Secure; HttpOnly; SameSite=Strict/);
  assert.equal((await call('/me','GET',null,cookie)).status,200);
  assert.equal((await call('/auth/logout','POST',{},cookie,'https://evil.example')).status,403);
  assert.equal((await call('/auth/logout','POST',{},cookie)).status,200);
  assert.equal((await call('/me','GET',null,cookie)).status,401);
});
test('private D1 chunks preserve binary bytes above row size, immutable retries and corrupt/missing data detection',async t=>{
  const f=await fixture(t),bucket=privateD1Bucket(f.env.DB),data=new Uint8Array(3*1024*1024+17);for(let i=0;i<data.length;i++)data[i]=i%251;
  await bucket.put('private/test',data,{httpMetadata:{contentType:'application/pdf'}});assert.deepEqual((await bucket.get('private/test')).body,data);
  await bucket.put('private/test',data);await assert.rejects(bucket.put('private/test',new Uint8Array([2])),e=>e.status===409);
  assert.equal(await bucket.get('missing'),null);
  await f.env.DB.prepare('DELETE FROM private_chunks WHERE key=? AND part=1').bind('private/test').run();await assert.rejects(bucket.get('private/test'),e=>e.status===503);
});
