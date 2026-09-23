import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import worker from '../server/worker.js';
import {localBindings} from '../scripts/local-backend.mjs';
import {CATALOG} from '../dist/waste-catalog.js';
import {hash} from '../server/accounts/common.js';
import {quantityBase} from '../server/accounts/lots.js';

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j2ioAAAAASUVORK5CYII=', 'base64');
const uuid = () => crypto.randomUUID();
async function fixture(t) {
  const env = await localBindings(await mkdtemp(path.join(tmpdir(), 'ewaste-accounts-')));
  t.after(() => env.close());
  Object.assign(env, {ACCOUNTS_ENABLED:'true', AUTH_RATE_SECRET:'test-only-rate-secret-never-used-for-deployment',
    TWILIO_ACCOUNT_SID:'AC'+'1'.repeat(32), TWILIO_VERIFY_SERVICE_SID:'VA'+'2'.repeat(32), TWILIO_AUTH_TOKEN:'test-provider-secret'});
  const sent = new Map(); let sendCount = 0, rejectProvider = false;
  env.OTP_TRANSPORT = async (url, options) => {
    assert.ok(url.startsWith('https://verify.twilio.com/v2/Services/VA'));
    const data = new URLSearchParams(options.body);
    if (rejectProvider) return new Response('{}', {status:503});
    if (url.endsWith('/Verifications')) {
      const sid = 'VE'+(++sendCount).toString(16).padStart(32,'0');
      sent.set(sid, {mobile:data.get('To'), code:'123456'});
      return Response.json({sid,status:'pending'});
    }
    const sid = data.get('VerificationSid');
    return Response.json({sid,status:sent.get(sid)?.code === data.get('Code') ? 'approved':'pending'});
  };
  const call = (route, {method='GET',token,input,bytes,type='application/json',headers={}}={}) => worker.fetch(new Request('https://app.example/api/v1'+route, {
    method, headers:{'Content-Type':type, 'CF-Connecting-IP':'192.0.2.1', ...(token?{Authorization:'Bearer '+token}:{}), ...headers},
    ...(['GET','HEAD'].includes(method) ? {} : {body:bytes || JSON.stringify(input || {})}),
  }),env);
  async function challenge(mobile='9000000001',role='collector') {
    const response=await call('/auth/challenges',{method:'POST',input:{mobile,role,language:'en'}});
    assert.equal(response.status,201,JSON.stringify(await response.clone().json()));
    return (await response.json()).challengeId;
  }
  async function login(mobile='9000000001',role='collector') {
    const challengeId=await challenge(mobile,role);
    const response=await call('/auth/verify',{method:'POST',input:{challengeId,code:'123456'}});
    assert.equal(response.status,200,JSON.stringify(await response.clone().json()));
    return response.json();
  }
  return {env,call,challenge,login,sends:()=>sendCount,rejectProvider:()=>{rejectProvider=true;}};
}

function draft(extra={}) {
  return {commandId:uuid(),expectedVersion:0,taxonomyVersion:CATALOG.version,title:'Two laptops',locality:'Mumbai',notes:'Keep this evidence',fileIds:[],
    items:[{id:uuid(),broadCode:'B01',detailedCode:'ITEW3',description:'Used laptops',condition:'sorted',unit:'piece',quantity:'2',reviewState:'confirmed'}],...extra};
}

test('additive migration preserves legacy records and seeds the existing 20/106 catalogue',async t=>{
  const {env}=await fixture(t);
  assert.equal((await env.DB.prepare('SELECT count(*) AS n FROM broad_categories').first()).n,20);
  assert.equal((await env.DB.prepare('SELECT count(*) AS n FROM equipment_categories').first()).n,106);
  await env.DB.prepare("INSERT INTO spaces VALUES ('old','hash','{}',0,NULL,'2026-01-01')").run();
  assert.equal((await env.DB.prepare("SELECT state_json FROM spaces WHERE id='old'").first()).state_json,'{}');
  const fk=await env.DB.prepare('PRAGMA foreign_keys').first();assert.equal(fk.foreign_keys,1);
});

test('account-enabled servers do not expose the legacy shared-workspace write surface',async t=>{
  const {env}=await fixture(t);
  const response=await worker.fetch(new Request('https://app.example/api/spaces',{method:'POST',headers:{'oai-authenticated-user-id':'untrusted-header'}}),env);
  assert.equal(response.status,410);
  assert.equal((await worker.fetch(new Request('https://app.example/api/health'),env)).status,200);
});

test('OTP signup stores only a token hash; registered role wins over a later role selection',async t=>{
  const f=await fixture(t), account=await f.login();
  assert.equal(account.user.role,'collector');assert.match(account.token,/^ews_[a-f0-9]{64}$/);
  const session=await f.env.DB.prepare('SELECT * FROM sessions').first();assert.equal(session.token_hash,await hash(account.token));
  assert.equal((await f.call('/me',{token:account.token})).status,200);
  await f.env.DB.prepare('DELETE FROM auth_rate_limits').run();
  const second=await f.login('9000000001','recycler');assert.equal(second.user.id,account.user.id);assert.equal(second.user.role,'collector');
  assert.equal((await f.env.DB.prepare('SELECT count(*) AS n FROM organizations').first()).n,0);
  assert.equal((await f.call('/auth/challenges',{method:'POST',input:{mobile:'9000000003',role:'ops'}})).status,400);
});

test('recycler creates one unverified organization/facility and cannot write collector drafts',async t=>{
  const f=await fixture(t), account=await f.login('9000000002','recycler');
  const profile=await(await f.call('/me',{token:account.token})).json();
  assert.equal(profile.facilities.length,1);assert.equal(profile.facilities[0].verificationStatus,'unverified');
  assert.equal((await f.call('/lots/'+uuid(),{method:'PUT',token:account.token,input:draft()})).status,403);
  assert.equal((await f.call('/me',{method:'PUT',token:account.token,input:{role:'collector'}})).status,400);
});

test('wrong codes, expired challenges, attempts and concurrent replay cannot establish extra sessions',async t=>{
  const f=await fixture(t), challengeId=await f.challenge();
  for(let i=0;i<5;i++) assert.equal((await f.call('/auth/verify',{method:'POST',input:{challengeId,code:'000000'}})).status,401);
  assert.equal((await f.call('/auth/verify',{method:'POST',input:{challengeId,code:'123456'}})).status,401);
  const expired=await f.challenge('9000000002');
  await f.env.DB.prepare("UPDATE auth_challenges SET expires_at='2000-01-01T00:00:00.000Z' WHERE id=?").bind(expired).run();
  assert.equal((await f.call('/auth/verify',{method:'POST',input:{challengeId:expired,code:'123456'}})).status,401);
  const active=await f.challenge('9000000003');
  const answers=await Promise.all([1,2].map(()=>f.call('/auth/verify',{method:'POST',input:{challengeId:active,code:'123456'}})));
  assert.deepEqual(answers.map(r=>r.status).sort(),[200,401]);
  assert.equal((await f.env.DB.prepare('SELECT count(*) AS n FROM sessions').first()).n,1);
  assert.equal((await f.call('/auth/verify',{method:'POST',input:{challengeId:active,code:'123456'}})).status,401);
});

test('missing configuration and upstream failure fail closed; repeated SMS requests are limited',async t=>{
  const f=await fixture(t);
  delete f.env.TWILIO_AUTH_TOKEN;
  assert.equal((await f.call('/auth/challenges',{method:'POST',input:{mobile:'9000000001',role:'collector'}})).status,503);
  assert.equal(f.sends(),0);f.env.TWILIO_AUTH_TOKEN='test';
  await f.challenge();
  assert.equal((await f.call('/auth/challenges',{method:'POST',input:{mobile:'9000000001',role:'collector'}})).status,429);
  assert.equal(f.sends(),1);
  f.rejectProvider();
  assert.equal((await f.call('/auth/challenges',{method:'POST',input:{mobile:'9000000002',role:'collector'}})).status,503);
  assert.equal((await f.env.DB.prepare("SELECT count(*) AS n FROM auth_challenges WHERE status='failed'").first()).n,1);
  f.env.ACCOUNTS_ENABLED='false';assert.equal((await f.call('/me')).status,503);
});

test('logout, expiry and suspension invalidate sessions; workspace codes never authenticate accounts',async t=>{
  const f=await fixture(t), one=await f.login(), two=await f.login('9000000002'), three=await f.login('9000000003');
  assert.equal((await f.call('/auth/logout',{method:'POST',token:one.token})).status,200);
  assert.equal((await f.call('/me',{token:one.token})).status,401);
  await f.env.DB.prepare("UPDATE sessions SET expires_at='2000-01-01' WHERE user_id=?").bind(two.user.id).run();
  assert.equal((await f.call('/me',{token:two.token})).status,401);
  await f.env.DB.prepare("UPDATE users SET status='suspended' WHERE id=?").bind(three.user.id).run();
  assert.equal((await f.call('/me',{token:three.token})).status,401);
  assert.equal((await f.call('/me',{token:'0'.repeat(48)})).status,401);
  assert.equal((await f.call('/me',{headers:{'oai-authenticated-user-id':one.user.id}})).status,401);
});

test('profile edits enforce versions and cannot change role or another user',async t=>{
  const f=await fixture(t), a=await f.login(), b=await f.login('9000000002');
  const response=await f.call('/me',{method:'PUT',token:a.token,input:{displayName:'Collector A',language:'hi',locality:'Thane',expectedVersion:1,userId:b.user.id}});
  assert.equal(response.status,200);assert.equal((await response.json()).user.version,2);
  assert.equal((await(await f.call('/me',{token:b.token})).json()).user.displayName,'');
  assert.equal((await f.call('/me',{method:'PUT',token:a.token,input:{displayName:'Stale',language:'en',locality:'Mumbai',expectedVersion:1}})).status,409);
});

test('private photo uploads are immutable, bounded, and cannot cross accounts',async t=>{
  const f=await fixture(t), a=await f.login(), b=await f.login('9000000002'), photo=uuid();
  assert.equal((await f.call('/files/'+photo,{method:'PUT',token:a.token,bytes:png,type:'image/png'})).status,201);
  assert.equal((await f.call('/files/'+photo,{method:'PUT',token:a.token,bytes:png,type:'image/png'})).status,200);
  const get=await f.call('/files/'+photo,{token:a.token});assert.equal(get.status,200);assert.equal(get.headers.get('cache-control'),'private, no-store');
  assert.deepEqual(Buffer.from(await get.arrayBuffer()),png);
  assert.equal((await f.call('/files/'+photo,{token:b.token})).status,404);
  assert.equal((await f.call('/files/'+photo,{method:'PUT',token:b.token,bytes:png,type:'image/png'})).status,404);
  assert.equal((await f.call('/files/'+uuid(),{method:'PUT',token:a.token,bytes:png.subarray(0,30),type:'image/png'})).status,415);
  assert.equal((await f.call('/files/'+uuid(),{method:'PUT',token:a.token,bytes:png,type:'image/jpeg'})).status,415);
  assert.equal((await f.call('/files/'+uuid(),{method:'PUT',token:a.token,bytes:new Uint8Array(2097153),type:'image/png'})).status,413);
  assert.equal((await f.call('/lots/'+uuid(),{method:'PUT',token:b.token,input:draft({fileIds:[photo]})})).status,409);
});

test('draft retry is idempotent and stale/concurrent updates cannot partially replace items',async t=>{
  const f=await fixture(t), a=await f.login(), b=await f.login('9000000002'), lot=uuid(), input=draft();
  const first=await f.call('/lots/'+lot,{method:'PUT',token:a.token,input});assert.equal(first.status,201);
  const again=await(await f.call('/lots/'+lot,{method:'PUT',token:a.token,input})).json();assert.equal(again.replayed,true);assert.equal(again.version,1);
  assert.equal((await f.call('/lots/'+lot,{method:'PUT',token:a.token,input:{...input,title:'Different retry'}})).status,409);
  assert.equal((await f.call('/lots/'+lot,{token:b.token})).status,404);
  assert.equal((await f.call('/lots/'+lot,{method:'PUT',token:b.token,input:draft()})).status,404);
  const changes=['First change','Second change'].map(title=>({...input,commandId:uuid(),expectedVersion:1,title,items:[{...input.items[0],description:title}]}));
  const results=await Promise.all(changes.map(input=>f.call('/lots/'+lot,{method:'PUT',token:a.token,input})));
  assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
  const saved=(await(await f.call('/lots/'+lot,{token:a.token})).json()).lot;
  assert.equal(saved.version,2);assert.equal(saved.title,saved.items[0].description);
  assert.equal((await f.env.DB.prepare('SELECT count(*) AS n FROM command_receipts').first()).n,2);
  assert.equal((await(await f.call('/lots',{token:b.token})).json()).lots.length,0);
});

test('draft quantities use exact base units and foreign-key catalogue values are enforced',async t=>{
  const f=await fixture(t), a=await f.login();
  assert.equal(quantityBase('1.125','kg'),1125);assert.equal(quantityBase('0.001','kg'),1);
  assert.throws(()=>quantityBase('1.5','piece'));assert.throws(()=>quantityBase('1e3','kg'));assert.throws(()=>quantityBase('0','kg'));
  const input=draft();input.items[0].broadCode='B99';
  assert.equal((await f.call('/lots/'+uuid(),{method:'PUT',token:a.token,input})).status,400);
  input.items[0].broadCode='B01';input.items[0].unit='kg';input.items[0].quantity='1.125';
  const lot=uuid();assert.equal((await f.call('/lots/'+lot,{method:'PUT',token:a.token,input})).status,201);
  assert.equal((await f.env.DB.prepare('SELECT quantity_base FROM lot_items WHERE lot_id=?').bind(lot).first()).quantity_base,1125);
  assert.equal((await(await f.call('/lots/'+lot,{token:a.token})).json()).lot.items[0].quantity,'1.125');
});
