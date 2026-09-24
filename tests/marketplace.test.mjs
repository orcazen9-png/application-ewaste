import {fixture} from './helpers/market-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import worker from '../server/worker.js';
import {localBindings} from '../scripts/local-backend.mjs';
import {hash} from '../server/accounts/common.js';
import {CATALOG} from '../dist/waste-catalog.js';
import {materialAmount} from '../server/accounts/marketplace.js';
const id=()=>crypto.randomUUID(),future=()=>new Date(Date.now()+30*86400000).toISOString();
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j2ioAAAAASUVORK5CYII=','base64');
test('demo facility access is explicit, expires and never claims verification',async t=>{
  const f=await fixture(t),r=await f.user('recycler',false),c=await f.user(),lot=await f.lot(c);
  await f.env.DB.prepare('INSERT INTO demo_facility_access VALUES(?,?,?)').bind(r.facility,future(),'Invited demo only').run();
  const req=await f.requirement(r,{state:'paused'}),publish={...req.input,commandId:id(),expectedVersion:1,state:'active',reason:'Demo'};
  assert.equal((await f.call(r,'/requirements/'+req.id,'PUT',publish)).status,403);
  f.env.DEMO_MODE='true';await f.ok(r,'/requirements/'+req.id,'PUT',publish);
  const matches=(await f.ok(c,`/matches?lotId=${lot.id}&itemId=${lot.itemId}`)).matches;
  assert.equal(matches[0].demoAccess,true);assert.equal(matches[0].verificationStatus,'unverified');
  const s=await f.request(c,lot,req,{requirementVersion:2});
  await f.env.DB.prepare("UPDATE demo_facility_access SET expires_at='2000-01-01' WHERE facility_id=?").bind(r.facility).run();
  assert.equal((await f.call(r,'/requests/'+s.id+'/accept','POST',{commandId:id(),expectedVersion:1})).status,403);
  await f.env.DB.prepare('UPDATE demo_facility_access SET expires_at=? WHERE facility_id=?').bind(future(),r.facility).run();
  await f.ok(r,'/requests/'+s.id+'/accept','POST',{commandId:id(),expectedVersion:1});
  assert.equal((await f.env.DB.prepare('SELECT verification_status FROM facilities WHERE id=?').bind(r.facility).first()).verification_status,'unverified');
});
test('marketplace migration sorts after the installed account foundation for timestamp-based migrators',async()=>{
  const journal=JSON.parse(await readFile('drizzle/meta/_journal.json','utf8'));
  for(let i=1;i<journal.entries.length;i++)assert.ok(journal.entries[i].when>journal.entries[i-1].when,'Migrations must increase so an existing installation does not skip the new schema');
});
test('quote calculations keep exact paise even when the intermediate grams product exceeds safe Number precision',()=>{
  assert.equal(materialAmount(9999999999,49999999,'kg'),499999989950000);
  assert.equal(materialAmount(1,500,'kg'),1);
  assert.equal(materialAmount(1,499,'kg'),0);
  assert.equal(materialAmount(12345,3,'piece'),37035);
});
test('only verified recyclers publish their own portfolio; prices retain revision history',async t=>{
  const f=await fixture(t),r=await f.user('recycler',false),c=await f.user(),other=await f.user('recycler');
  const req=await f.requirement(r,{state:'paused'});
  assert.equal((await f.call(r,'/requirements/'+req.id,'PUT',{...req.input,commandId:id(),expectedVersion:1,state:'active',reason:'Publish'})).status,403);
  assert.equal((await f.call(c,'/requirements/'+req.id)).status,403);
  assert.equal((await f.call(other,'/requirements/'+req.id)).status,404);
  await f.ok(r,'/requirements/'+req.id,'PUT',{...req.input,commandId:id(),expectedVersion:1,rate:'55.25',reason:'New market quote'});
  assert.equal((await f.env.DB.prepare('SELECT count(*) AS n FROM requirement_revisions').first()).n,2);
  assert.equal((await f.ok(r,'/requirements/'+req.id)).requirement.rate,'55.25');
});
test('matching explains compatibility and hides paused, unverified and expired portfolio entries',async t=>{
  const f=await fixture(t),c=await f.user(),r=await f.user('recycler'),lot=await f.lot(c);
  await f.requirement(r,{unit:'piece',areas:['Delhi'],minimum:'600',target:'700'});
  await f.requirement(r,{minimum:'600',target:'700'});
  await f.requirement(r,{state:'paused'});const expired=await f.requirement(r);
  await f.env.DB.prepare("UPDATE requirements SET valid_until='2000-01-01T00:00:00.000Z' WHERE id=?").bind(expired.id).run();
  await f.requirement(r,{target:'100'});
  const matches=(await f.ok(c,`/matches?lotId=${lot.id}&itemId=${lot.itemId}`)).matches;
  const reasons=matches.flatMap(m=>m.exclusions).join(' ');
  for(const fragment of ['unit','area','minimum','remaining'])assert.ok(reasons.includes(fragment),fragment);
  assert.ok(matches.every(m=>m.state==='active'&&m.id!==expired.id));
  assert.equal((await f.call(r,`/matches?lotId=${lot.id}&itemId=${lot.itemId}`)).status,403);
});
test('collector and recycler share one accepted order, exact material amount and independent logistics/payment state',async t=>{
  const f=await fixture(t),c=await f.user(),r=await f.user('recycler'),lot=await f.lot(c),req=await f.requirement(r),s=await f.request(c,lot,req);
  const input={commandId:id(),expectedVersion:1};const a=await f.ok(r,'/requests/'+s.id+'/accept','POST',input);
  assert.equal((await f.ok(r,'/requests/'+s.id+'/accept','POST',input)).id,a.id);
  const collector=await f.ok(c,'/orders/'+a.id),recycler=await f.ok(r,'/orders/'+a.id);assert.deepEqual(collector,recycler);
  assert.equal(collector.order.materialAmount,'10000.00');assert.equal(collector.order.paymentState,'Not recorded');assert.match(collector.order.logistics,/recycler pays separately/);
  assert.equal((await f.ok(r,'/requirements/'+req.id)).requirement.remaining,'300.000');
  assert.equal((await f.env.DB.prepare('SELECT count(*) AS n FROM orders').first()).n,1);
  assert.equal((await f.call(c,'/lots/'+lot.id,'PUT',{...lot.input,expectedVersion:1,commandId:id(),title:'Changed reserved stock'})).status,409);
  const third=await f.user();assert.equal((await f.call(third,'/orders/'+a.id)).status,404);
  await f.ok(c,'/orders/'+a.id+'/cancel','POST',{commandId:id(),expectedVersion:1,message:'Pickup is no longer needed'});
  assert.equal((await f.ok(r,'/requirements/'+req.id)).requirement.remaining,'500.000');
  await f.ok(c,'/lots/'+lot.id,'PUT',{...lot.input,expectedVersion:1,commandId:id(),title:'Stock editable after release'});
});
test('concurrent acceptances cannot oversell one collector lot to two recyclers',async t=>{
  const f=await fixture(t),c=await f.user(),a=await f.user('recycler'),b=await f.user('recycler'),lot=await f.lot(c);
  const ra=await f.requirement(a),rb=await f.requirement(b),sa=await f.request(c,lot,ra,{quantity:'400'}),sb=await f.request(c,lot,rb,{quantity:'400'});
  const answers=await Promise.all([[a,sa],[b,sb]].map(([u,s])=>f.call(u,'/requests/'+s.id+'/accept','POST',{commandId:id(),expectedVersion:1})));
  assert.deepEqual(answers.map(r=>r.status).sort(),[200,409]);
  assert.equal((await f.env.DB.prepare('SELECT sum(quantity_base) AS n FROM reservations').first()).n,400000);
  assert.equal((await f.env.DB.prepare('SELECT count(*) AS n FROM orders').first()).n,1);
});
test('concurrent acceptances cannot overfill finite demand; unlimited demand remains explicit',async t=>{
  const f=await fixture(t),r=await f.user('recycler'),a=await f.user(),b=await f.user(),ra=await f.requirement(r),la=await f.lot(a),lb=await f.lot(b);
  const sa=await f.request(a,la,ra,{quantity:'400'}),sb=await f.request(b,lb,ra,{quantity:'400'});
  const answers=await Promise.all([sa,sb].map(s=>f.call(r,'/requests/'+s.id+'/accept','POST',{commandId:id(),expectedVersion:1})));
  assert.deepEqual(answers.map(r=>r.status).sort(),[200,409]);
  const unlimited=await f.requirement(r,{target:null});assert.equal((await f.ok(r,'/requirements/'+unlimited.id)).requirement.remaining,null);
  assert.equal((await f.call(r,'/requirements/'+ra.id,'PUT',{...ra.input,commandId:id(),expectedVersion:1,target:'100',reason:'Reduce demand'})).status,409);
});
test('stale quotes/drafts cannot be submitted or accepted and request retries preserve evidence',async t=>{
  const f=await fixture(t),c=await f.user(),r=await f.user('recycler'),lot=await f.lot(c),req=await f.requirement(r),s=await f.request(c,lot,req);
  assert.equal((await f.ok(c,'/requests/'+s.id,'POST',s.input)).replayed,true);
  await f.ok(r,'/requirements/'+req.id,'PUT',{...req.input,commandId:id(),expectedVersion:1,rate:'60.00',reason:'Price revised'});
  assert.equal((await f.call(r,'/requests/'+s.id+'/accept','POST',{commandId:id(),expectedVersion:1})).status,409);
  assert.equal((await f.call(c,'/requests/'+id(),'POST',{...s.input,commandId:id()})).status,409);
  assert.equal((await f.ok(c,'/requests/'+s.id)).request.snapshot.estimatedMaterial,'10000.00');
  await f.ok(c,'/requests/'+s.id+'/withdraw','POST',{commandId:id(),expectedVersion:1,message:'Review updated quote'});
  const fresh=await f.request(c,lot,req,{requirementVersion:2});
  await f.ok(c,'/lots/'+lot.id,'PUT',{...lot.input,commandId:id(),expectedVersion:1,title:'New evidence'});
  assert.equal((await f.call(r,'/requests/'+fresh.id+'/accept','POST',{commandId:id(),expectedVersion:1})).status,409);
});
test('clarification and rejection are scoped; shared photos do not expose the rest of the collector account',async t=>{
  const f=await fixture(t),c=await f.user(),r=await f.user('recycler'),other=await f.user('recycler'),photo=id();
  const response=await worker.fetch(new Request('https://test.example/api/v1/files/'+photo,{method:'PUT',headers:{Authorization:'Bearer '+c.token,'Content-Type':'image/png'},body:png}),f.env);assert.equal(response.status,201);
  const lot=await f.lot(c,{fileIds:[photo]}),req=await f.requirement(r),s=await f.request(c,lot,req);
  assert.equal((await f.call(r,'/files/'+photo)).status,404);
  const shared=await f.call(r,`/requests/${s.id}/photos/${photo}`);assert.equal(shared.status,200);assert.equal(shared.headers.get('cache-control'),'private, no-store');
  assert.equal((await f.call(other,`/requests/${s.id}/photos/${photo}`)).status,404);
  await f.ok(r,'/requests/'+s.id+'/clarify','POST',{commandId:id(),expectedVersion:1,message:'Are these sorted?'});
  await f.ok(c,'/requests/'+s.id+'/clarify','POST',{commandId:id(),expectedVersion:2,message:'Yes, sorted by type'});
  assert.equal((await f.call(c,'/requests/'+s.id+'/reject','POST',{commandId:id(),expectedVersion:3,message:'No'})).status,403);
  await f.ok(r,'/requests/'+s.id+'/reject','POST',{commandId:id(),expectedVersion:3,message:'Cannot accept this condition'});
  assert.equal((await f.env.DB.prepare('SELECT count(*) AS n FROM reservations').first()).n,0);
});
test('post-acceptance prices require the other party acknowledgment and never mark payment',async t=>{
  const f=await fixture(t),c=await f.user(),r=await f.user('recycler'),lot=await f.lot(c),req=await f.requirement(r),s=await f.request(c,lot,req),a=await f.ok(r,'/requests/'+s.id+'/accept','POST',{commandId:id(),expectedVersion:1});
  await f.ok(r,'/orders/'+a.id+'/propose-terms','POST',{commandId:id(),expectedVersion:1,amount:'9500.50',message:'Revised quote after review'});
  assert.equal((await f.ok(c,'/orders/'+a.id)).order.materialAmount,'10000.00');
  assert.equal((await f.call(r,'/orders/'+a.id+'/acknowledge-terms','POST',{commandId:id(),expectedVersion:2,termsVersion:2})).status,403);
  await f.ok(c,'/orders/'+a.id+'/acknowledge-terms','POST',{commandId:id(),expectedVersion:2,termsVersion:2});
  const updated=await f.ok(r,'/orders/'+a.id);assert.equal(updated.order.materialAmount,'9500.50');assert.equal(updated.order.paymentState,'Not recorded');assert.equal(updated.terms.length,2);
  assert.equal((await f.call(c,'/orders/'+a.id+'/acknowledge-terms','POST',{commandId:id(),expectedVersion:2,termsVersion:2})).status,409);
});
test('Gemini account results are retained and reused; failures preserve the manual path',async t=>{
  const f=await fixture(t),c=await f.user(),photo=id();let calls=0;
  await worker.fetch(new Request('https://test.example/api/v1/files/'+photo,{method:'PUT',headers:{Authorization:'Bearer '+c.token,'Content-Type':'image/png'},body:png}),f.env);
  const aid=id();assert.equal((await f.call(c,'/assessments/'+aid,'POST',{fileId:photo,consent:true})).status,503);
  Object.assign(f.env,{GEMINI_API_KEY:'test-secret',GEMINI_MODEL:'test-model',ASSESSMENT_TRANSPORT:async()=>{calls++;return Response.json({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify({status:'identified',items:[{code:'B01',evidence:'Computer',approximateCount:1}],description:'A computer',uncertainty:'Condition unknown',nextPhoto:'Label'})}]}}]});}});
  const result=await f.ok(c,'/assessments/'+aid,'POST',{fileId:photo,consent:true});assert.equal(result.result.items[0].code,'B01');
  assert.equal((await f.ok(c,'/assessments/'+id(),'POST',{fileId:photo,consent:true})).cached,true);assert.equal(calls,1);
  const other=await f.user();assert.equal((await f.call(other,'/assessments/'+aid)).status,404);
});

test('a specific detailed requirement needs the recycler latest confirmed code, without changing original evidence',async t=>{
  const f=await fixture(t),c=await f.user(),r=await f.user('recycler'),lot=await f.lot(c),req=await f.requirement(r,{detailedCode:'ITEW3'}),s=await f.request(c,lot,req);
  assert.equal((await f.call(r,'/requests/'+s.id+'/accept','POST',{commandId:id(),expectedVersion:1})).status,409);
  assert.equal((await f.call(c,'/requests/'+s.id+'/review-category','POST',{commandId:id(),expectedVersion:1,code:'ITEW3'})).status,403);
  await f.ok(r,'/requests/'+s.id+'/review-category','POST',{commandId:id(),expectedVersion:1,code:'ITEW3'});
  await f.ok(r,'/requests/'+s.id+'/review-category','POST',{commandId:id(),expectedVersion:2,code:'ITEW2'});
  assert.equal((await f.call(r,'/requests/'+s.id+'/accept','POST',{commandId:id(),expectedVersion:3})).status,409);
  await f.ok(r,'/requests/'+s.id+'/review-category','POST',{commandId:id(),expectedVersion:3,code:'ITEW3'});
  await f.ok(r,'/requests/'+s.id+'/accept','POST',{commandId:id(),expectedVersion:4});
  const evidence=await f.ok(c,'/requests/'+s.id);assert.equal(evidence.request.snapshot.detailedCode,null);assert.equal(evidence.events.filter(e=>e.kind==='category.confirmed').length,3);
});
