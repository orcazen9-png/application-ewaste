import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './helpers/market-fixture.mjs';
import worker from '../server/worker.js';
const id=()=>crypto.randomUUID(),time=()=>new Date().toISOString();
const enc=value=>Buffer.from(typeof value==='string'?value:JSON.stringify(value)).toString('base64url');
async function setup(t){
  const f=await fixture(t),c=await f.user(),r=await f.user('recycler'),lot=await f.lot(c),req=await f.requirement(r),request=await f.request(c,lot,req),accepted=await f.ok(r,'/requests/'+request.id+'/accept','POST',{commandId:id(),expectedVersion:1});
  const order=accepted.id,staff=id();f.env.OPS_ENABLED='true';f.env.OPS_ACCESS_ISSUER='https://test-'+id()+'.cloudflareaccess.com';f.env.OPS_ACCESS_AUD='test-operations';
  const keys=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',hash:'SHA-256',modulusLength:2048,publicExponent:new Uint8Array([1,0,1])},true,['sign','verify']);
  const jwk=await crypto.subtle.exportKey('jwk',keys.publicKey);jwk.kid='test';
  f.env.ACCESS_CERT_TRANSPORT=async()=>new Response(JSON.stringify({keys:[jwk]}));
  await f.env.DB.prepare("INSERT INTO operations_staff VALUES(?,?,?,'Ops','operations','active',?)").bind(staff,'staff-subject','ops@example.test',time()).run();
  const sign=async extra=>{const head=enc({alg:'RS256',kid:'test'}),claims=enc({iss:f.env.OPS_ACCESS_ISSUER,aud:['test-operations'],sub:'staff-subject',email:'ops@example.test',iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+3600,...extra}),signature=await crypto.subtle.sign('RSASSA-PKCS1-v1_5',keys.privateKey,Buffer.from(head+'.'+claims));return head+'.'+claims+'.'+Buffer.from(signature).toString('base64url');};
  const token=await sign({});
  const ops=(path,method='GET',input,headers={})=>worker.fetch(new Request('https://test.example/api/ops'+path,{method,headers:{'Cf-Access-Jwt-Assertion':token,Origin:'https://test.example','Content-Type':'application/json',...headers},...(method==='GET'?{}:{body:JSON.stringify(input)})}),f.env);
  const okOps=async(path,method='GET',input)=>{const res=await ops(path,method,input),data=await res.json();assert.equal(res.status,200,JSON.stringify(data));return data;};
  const read=()=>f.ok(c,'/orders/'+order+'/logistics');
  const act=async(actor,kind,input={})=>{const v=(await read()).order.version,payload={commandId:id(),expectedVersion:v,...input};return actor==='ops'?okOps('/orders/'+order+'/'+kind,'POST',payload):f.ok(actor,'/orders/'+order+'/logistics/'+kind,'POST',payload);};
  const partner=id(),p={commandId:id(),expectedVersion:0,name:'Local transport',contact:'Dispatch desk',areas:['Mumbai'],status:'active'};await okOps('/partners/'+partner,'PUT',p);
  const schedule=()=>act('ops','schedule',{partnerId:partner,start:new Date(Date.now()+3600000).toISOString(),end:new Date(Date.now()+7200000).toISOString(),instructions:'Loading bay',message:'Agreed window'});
  const cost=()=>act('ops','cost',{amount:'1000',basis:'estimate',payee:'Local transport',source:'Partner written quote',message:'Initial quote'});
  const ready=async()=>{await schedule();await cost();await act(r,'acknowledge-cost',{costVersion:1});};
  const evidence=(quantity,extra={})=>({quantity,capturedAt:time(),location:'Mumbai loading bay',locationSource:'manual',condition:'Sorted',message:'Scale reading checked',fileIds:[],noPhotoReason:'Camera unavailable; written weighbridge record checked',...extra});
  return {...f,c,r,order,req,sourceLot:lot,staff,partner,p,ops,okOps,sign,read,act,schedule,cost,ready,evidence};
}
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
