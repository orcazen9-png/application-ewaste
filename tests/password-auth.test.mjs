import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './helpers/market-fixture.mjs';
const password='several safe words for this demo';
const input=(role='collector',username='new.person')=>({username,password,role,displayName:'Demo business',locality:'Mumbai',language:'en'});
async function setup(t){const f=await fixture(t);f.env.PASSWORD_AUTH_ENABLED='true';f.env.AUTH_RATE_SECRET='test-rate-secret-with-32-characters';return f;}
const guest={token:''};

test('explicit role signup and login preserve identity, hash passwords and keep recycler unverified',async t=>{
 const f=await setup(t);
 for(const role of ['collector','recycler']){
  const data=input(role,role+'.demo'),account=await f.ok(guest,'/auth/register','POST',data,201);
  assert.equal(account.user.role,role);assert.equal(account.user.username,data.username);assert.equal(account.user.identityMethod,'password');assert.equal(account.user.mobile,'');
  const cred=await f.env.DB.prepare('SELECT * FROM auth_credentials WHERE user_id=?').bind(account.user.id).first();
  assert.match(cred.password_hash,/^scrypt-32768-8-3\$/);assert.ok(!cred.password_hash.includes(password));
  const again=await f.ok(guest,'/auth/login','POST',{...data,username:data.username.toUpperCase()});assert.equal(again.user.id,account.user.id);assert.notEqual(again.token,account.token);
  const profile=await f.ok(account,'/me');assert.equal(profile.user.username,data.username);
  if(role==='recycler'){assert.equal(profile.facilities.length,1);assert.equal(profile.facilities[0].verificationStatus,'unverified');assert.equal((await f.env.DB.prepare('SELECT count(*) AS n FROM demo_facility_access').first()).n,0);}
  await f.ok(again,'/auth/logout','POST');assert.equal((await f.call(again,'/me')).status,401);
 }
});
test('wrong role and credentials never issue a session; suspension blocks authentication',async t=>{
 const f=await setup(t),account=await f.ok(guest,'/auth/register','POST',input(),201);
 for(const data of [{...input(),role:'recycler'},{...input(),password:'a completely wrong password'},{...input(),username:'unknown'}]){
  assert.equal((await f.call(guest,'/auth/login','POST',data)).status,data.role==='recycler'?409:401);
 }
 assert.equal((await f.env.DB.prepare('SELECT count(*) AS n FROM sessions').first()).n,1);
 await f.env.DB.prepare("UPDATE users SET status='suspended' WHERE id=?").bind(account.user.id).run();
 assert.equal((await f.call(guest,'/auth/login','POST',input())).status,401);
});
test('invalid registration and concurrent username collision leave no orphan accounts',async t=>{
 const f=await setup(t);
 for(const data of [{...input(),role:undefined},{...input(),role:'staff'},{...input(),password:'short'},{...input(),username:'../bad'},{...input(),displayName:''}])assert.equal((await f.call(guest,'/auth/register','POST',data)).status,400);
 const answers=await Promise.all([1,2].map(()=>f.call(guest,'/auth/register','POST',input())));
 assert.deepEqual(answers.map(x=>x.status).sort(),[201,409]);
 for(const table of ['users','auth_credentials','sessions'])assert.equal((await f.env.DB.prepare(`SELECT count(*) AS n FROM ${table}`).first()).n,1);
});
test('invited users can set credentials only on their own account and keep lots and role',async t=>{
 const f=await setup(t),a=await f.user(),b=await f.user(),lot=await f.lot(a);
 assert.equal((await f.call(guest,'/auth/credentials','POST',input())).status,401);
 const updated=await f.ok(a,'/auth/credentials','POST',{...input('recycler'),userId:b.id});assert.equal(updated.user.id,a.id);assert.equal(updated.user.role,'collector');
 const login=await f.ok(guest,'/auth/login','POST',input());assert.equal(login.user.id,a.id);assert.equal((await f.ok(login,'/lots')).lots[0].id,lot.id);
 assert.equal((await f.call(b,'/lots/'+lot.id)).status,404);
 assert.equal((await f.call(a,'/auth/credentials','POST',input('collector','different.name'))).status,409);
});
test('password login is feature-gated and rate-limited before expensive hashing',async t=>{
 const f=await setup(t);f.env.PASSWORD_AUTH_ENABLED='false';assert.equal((await f.call(guest,'/auth/register','POST',input())).status,503);f.env.PASSWORD_AUTH_ENABLED='true';
 for(let i=0;i<15;i++)assert.equal((await f.call(guest,'/auth/login','POST',input())).status,401);
 assert.equal((await f.call(guest,'/auth/login','POST',input())).status,429);
});
