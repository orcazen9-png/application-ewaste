import {setup} from './helpers/logistics-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './helpers/market-fixture.mjs';
import worker from '../server/worker.js';
const id=()=>crypto.randomUUID(),time=()=>new Date().toISOString();
const enc=value=>Buffer.from(typeof value==='string'?value:JSON.stringify(value)).toString('base64url');
test('staff access validates signatures, audience, expiry, invitations, suspension and same-origin writes',async t=>{
  const f=await setup(t);
  assert.equal((await f.ops('/me','GET',null,{'Cf-Access-Jwt-Assertion':''})).status,401);
  for(const claims of [{aud:['wrong']},{exp:1},{sub:'uninvited'},{email:'other@example.test'}])assert.ok([401,403].includes((await f.ops('/me','GET',null,{'Cf-Access-Jwt-Assertion':await f.sign(claims)})).status));
  const token=await f.sign({});const parts=token.split('.');parts[1]=enc({sub:'staff-subject',email:'ops@example.test'});assert.equal((await f.ops('/me','GET',null,{'Cf-Access-Jwt-Assertion':parts.join('.')})).status,401);
  const badSignature=token.split('.');const sig=Buffer.from(badSignature[2],'base64url');sig[0]^=1;badSignature[2]=sig.toString('base64url');assert.equal((await f.ops('/me','GET',null,{'Cf-Access-Jwt-Assertion':badSignature.join('.')})).status,401);
  assert.equal((await f.ops('/partners/'+f.partner,'PUT',f.p,{Origin:'https://evil.example'})).status,403);
  assert.equal((await f.call(f.c,'/../ops/me')).status,401);
  await f.env.DB.prepare("UPDATE operations_staff SET status='suspended' WHERE id=?").bind(f.staff).run();assert.equal((await f.ops('/me')).status,403);
});
test('viewer cannot mutate orders or partners; collector and recycler cannot assign schedules',async t=>{
  const f=await setup(t);await f.env.DB.prepare("UPDATE operations_staff SET role='viewer' WHERE id=?").bind(f.staff).run();
  assert.equal((await f.ops('/orders/'+f.order+'/issue','POST',{commandId:id(),expectedVersion:1,message:'Unauthorized'})).status,403);
  assert.equal((await f.ops('/partners/'+id(),'PUT',f.p)).status,403);
  assert.equal((await f.call(f.c,'/orders/'+f.order+'/logistics/schedule','POST',{commandId:id(),expectedVersion:1})).status,403);
  const stranger=await f.user();assert.equal((await f.call(stranger,'/orders/'+f.order+'/logistics')).status,404);
});
test('rescheduling, charge revisions and handover keep material proceeds and payment independent',async t=>{
  const f=await setup(t);await f.ready();await f.schedule();await f.cost();
  let d=await f.read();assert.equal(d.logistics.costAcknowledged,false);assert.equal(d.order.materialAmount,'10000.00');
  assert.equal((await f.call(f.c,'/orders/'+f.order+'/logistics/pickup','POST',{commandId:id(),expectedVersion:d.order.version,...f.evidence('200')})).status,409);
  await f.act(f.r,'acknowledge-cost',{costVersion:2});await f.act(f.c,'pickup',f.evidence('200'));await f.act('ops','in-transit',{message:'Partner departed'});await f.act(f.r,'receipt',f.evidence('200'));
  d=await f.read();await f.act(f.c,'accept-receipt',{receiptId:d.logistics.receipt.id,message:'Quantity matches handover'});
  d=await f.read();assert.equal(d.logistics.acceptedQuantity,'200.000');assert.equal(d.order.materialAmount,'10000.00');assert.equal(d.order.paymentState,'Not recorded');assert.equal(d.logistics.cost.amount,'1000.00');assert.equal(d.logistics.cost.payer,'recycler');assert.equal(d.logistics.canCancel,false);
  assert.equal((await f.call(f.c,'/orders/'+f.order+'/cancel','POST',{commandId:id(),expectedVersion:d.order.version,message:'Invalid after pickup'})).status,409);
  assert.equal(d.records.filter(e=>e.kind==='schedule').length,2);
});
test('short receipt releases demand after review but missing stock only after collector-confirmed return',async t=>{
  const f=await setup(t);await f.ready();await f.act(f.c,'pickup',f.evidence('200'));await f.act(f.r,'receipt',f.evidence('180'));
  let d=await f.read();assert.equal(d.cases.length,1);await f.act(f.c,'accept-receipt',{receiptId:d.logistics.receipt.id,message:'180 kg received, 20 kg remains with carrier'});
  assert.equal((await f.ok(f.r,'/requirements/'+f.req.id)).requirement.remaining,'320.000');
  let z=await f.env.DB.prepare('SELECT * FROM reservations WHERE order_id=?').bind(f.order).first();assert.equal(z.quantity_base,200000);assert.equal(z.demand_base,180000);
  const issue=d.cases[0].id;assert.equal((await f.ops('/orders/'+f.order+'/resolve-issue','POST',{commandId:id(),expectedVersion:(await f.read()).order.version,caseId:issue,message:'Cannot hide missing goods'})).status,409);
  await f.act('ops','return-request',{message:'Return 20 kg remaining with carrier'});await f.act(f.c,'confirm-return',f.evidence('20'));await f.act('ops','resolve-issue',{caseId:issue,message:'Collector confirmed return of 20 kg'});
  z=await f.env.DB.prepare('SELECT * FROM reservations WHERE order_id=?').bind(f.order).first();assert.equal(z.quantity_base,180000);assert.equal(z.demand_base,180000);
  assert.equal((await f.read()).order.paymentState,'Not recorded');
  const another=await f.user(),lot=await f.lot(another),request=await f.request(another,lot,f.req,{quantity:'320'});await f.ok(f.r,'/requests/'+request.id+'/accept','POST',{commandId:id(),expectedVersion:1});
  assert.equal((await f.ok(f.r,'/requirements/'+f.req.id)).requirement.remaining,'0.000');
});
test('unavailable partners block handover and competing cancellation never releases collected goods',async t=>{
  const f=await setup(t);await f.ready();await f.okOps('/partners/'+f.partner,'PUT',{...f.p,commandId:id(),expectedVersion:1,status:'unavailable'});
  let v=(await f.read()).order.version;assert.equal((await f.call(f.c,'/orders/'+f.order+'/logistics/pickup','POST',{commandId:id(),expectedVersion:v,...f.evidence('200')})).status,409);
  await f.okOps('/partners/'+f.partner,'PUT',{...f.p,commandId:id(),expectedVersion:2});
  const results=await Promise.all([f.call(f.c,'/orders/'+f.order+'/logistics/pickup','POST',{commandId:id(),expectedVersion:v,...f.evidence('200')}),f.call(f.r,'/orders/'+f.order+'/cancel','POST',{commandId:id(),expectedVersion:v,message:'Cancel before pickup'})]);
  assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);const d=await f.read(),z=await f.env.DB.prepare('SELECT * FROM reservations WHERE order_id=?').bind(f.order).first();
  if(d.logistics.pickup)assert.equal(z.state,'held');else assert.equal(z.state,'released');
});
test('post-pickup cancellation uses return evidence and releases stock only once',async t=>{
  const f=await setup(t);await f.ready();await f.act(f.c,'pickup',f.evidence('150'));await f.act('ops','return-request',{message:'Recycler closed, return all goods'});
  const input={commandId:id(),expectedVersion:(await f.read()).order.version,...f.evidence('150')};
  const path='/orders/'+f.order+'/logistics/confirm-return';await f.ok(f.c,path,'POST',input);assert.equal((await f.ok(f.c,path,'POST',input)).replayed,true);
  assert.equal((await f.read()).logistics.state,'returned');assert.equal((await f.ok(f.r,'/requirements/'+f.req.id)).requirement.remaining,'500.000');
  const z=await f.env.DB.prepare('SELECT * FROM reservations WHERE order_id=?').bind(f.order).first();assert.equal(z.state,'released');
});
test('operations can close a pre-pickup issue after cancellation without reopening logistics',async t=>{
  const f=await setup(t);await f.act(f.c,'issue',{message:'Collection no longer needed'});let d=await f.read();
  await f.ok(f.c,'/orders/'+f.order+'/cancel','POST',{commandId:id(),expectedVersion:d.order.version,message:'Collector cancelled before pickup'});
  d=await f.read();await f.okOps('/orders/'+f.order+'/resolve-issue','POST',{commandId:id(),expectedVersion:d.order.version,caseId:d.cases[0].id,message:'Cancelled before pickup; no goods left collector'});
  d=await f.read();assert.equal(d.order.state,'cancelled');assert.equal(d.cases[0].state,'resolved');assert.equal(d.logistics.state,'cancelled');
});
test('concurrent stale logistics actions cannot duplicate custody or erase a schedule revision',async t=>{
  const f=await setup(t);await f.ready();const payload={commandId:id(),expectedVersion:(await f.read()).order.version,...f.evidence('200')},path='/orders/'+f.order+'/logistics/pickup';
  const answers=await Promise.all([f.call(f.c,path,'POST',payload),f.call(f.c,path,'POST',{...payload,commandId:id()})]);assert.deepEqual(answers.map(r=>r.status).sort(),[200,409]);
  assert.equal((await f.read()).records.filter(r=>r.kind==='pickup').length,1);
});
test('excess receipts are preserved as evidence, blocked from acceptance and corrected without overwriting history',async t=>{
  const f=await setup(t);await f.ready();await f.act(f.c,'pickup',f.evidence('200'));await f.act(f.r,'receipt',f.evidence('250'));
  let d=await f.read();assert.equal((await f.call(f.c,'/orders/'+f.order+'/logistics/accept-receipt','POST',{commandId:id(),expectedVersion:d.order.version,receiptId:d.logistics.receipt.id,message:'Unsafe excess'})).status,409);
  await f.act(f.r,'receipt',f.evidence('200',{supersedes:d.logistics.receipt.id,message:'Corrected scale transcription'}));d=await f.read();assert.equal(d.records.filter(r=>r.kind==='receipt').length,2);await f.act(f.c,'accept-receipt',{receiptId:d.logistics.receipt.id,message:'Checked corrected quantity'});
});
test('private staff notes and unshared photos never leak to a party or another order',async t=>{
  const f=await setup(t);await f.act('ops','internal-note',{message:'Private partner escalation'});assert.ok(!(JSON.stringify(await f.read())).includes('Private partner escalation'));
  assert.ok(JSON.stringify(await f.okOps('/orders/'+f.order)).includes('Private partner escalation'));
  const photo=id();const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j2ioAAAAASUVORK5CYII=','base64');
  const upload=await worker.fetch(new Request('https://test.example/api/v1/files/'+photo,{method:'PUT',headers:{Authorization:'Bearer '+f.r.token,'Content-Type':'image/png'},body:png}),f.env);assert.equal(upload.status,201);
  assert.equal((await f.call(f.c,'/files/'+photo)).status,404);await f.ready();await f.act(f.c,'pickup',f.evidence('200'));
  let d=await f.read();assert.equal((await f.call(f.c,'/orders/'+f.order+'/logistics/receipt','POST',{commandId:id(),expectedVersion:d.order.version,...f.evidence('200',{fileIds:[photo]})})).status,403);
  await f.act(f.r,'receipt',f.evidence('200',{fileIds:[photo],noPhotoReason:''}));
  assert.equal((await f.call(f.c,'/orders/'+f.order+'/logistics/photos/'+photo)).status,200);
  const stranger=await f.user();assert.equal((await f.call(stranger,'/orders/'+f.order+'/logistics/photos/'+photo)).status,404);
});
