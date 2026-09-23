import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createState,newId} from '../dist/domain.js';
import {marketState,marketCommand,collectorProjection} from '../server/collector-market.js';
import worker from '../server/worker.js';
import {localBindings} from '../scripts/local-backend.mjs';
const now='2026-09-24T10:00:00Z';
const orderInput=(extra={})=>({requirementId:'requirement-phones',quoteVersion:1,quantity:'2',unit:'piece',locality:'Mumbai',materialConfirmed:true,...extra});
const run=(s,type,input)=>marketCommand(s,{type:'market_'+type,input},now);
test('collector projection preserves legacy lots and does not seed fictitious orders',()=>{
 const s=createState();s.lots.push({id:'preserved'});const p=collectorProjection(s);assert.equal(p.lots[0].id,'preserved');assert.equal(p.collectorMarket.requirements.length,7);assert.equal(p.collectorMarket.orders.length,0);assert.equal(s.collectorMarket,undefined);assert.ok(p.collectorMarket.recyclers.every(r=>r.verification==='demo_unverified'));
});
test('orders use server prices, reject units, expiry, stale quotes and invalid quantities',()=>{
 for(const extra of [{quantity:'1.5'},{quantity:'0'},{quantity:'21'},{unit:'kg'},{quoteVersion:7},{locality:'Pune'},{materialConfirmed:false}])assert.throws(()=>run(createState(),'order',orderInput(extra)));
 const s=createState();const o=run(s,'order',orderInput({unitPricePaise:1}));assert.equal(o.estimatedTotalPaise,100000);assert.equal(o.unitPricePaise,50000);
 const weight=run(s,'order',orderInput({requirementId:'requirement-pcb',unit:'kg',quantity:'1.125'}));assert.equal(weight.estimatedTotalPaise,20813);
 assert.throws(()=>marketCommand(s,{type:'market_order',input:orderInput()},'2026-11-01T00:00Z'),/expired/);
 assert.throws(()=>run(s,'order',orderInput({photoId:newId('photo')})),/Confirm categories/);
});
test('complete order lifecycle keeps quote snapshot and records received quantity and earnings',()=>{
 const s=createState();const o=run(s,'order',orderInput());s.collectorMarket.requirements.find(r=>r.id===o.requirementId).quotedPricePaise=99999;
 const advance=(status,extra={})=>run(s,'order_status',{orderId:o.id,expectedVersion:s.collectorMarket.orders[0].version,status,...extra});
 assert.throws(()=>advance('completed'),/cannot move/);advance('accepted');advance('pickup');advance('received',{confirmedQuantity:'1'});advance('completed');
 const done=s.collectorMarket.orders[0];assert.equal(done.paidPaise,50000);assert.equal(done.timeline.length,5);assert.equal(s.collectorMarket.contacts[0].status,'order_created');assert.throws(()=>advance('cancelled',{note:'late cancellation'}),/cannot move/);
});
test('contact history is separate, repeatable, and cancellation preserves history',()=>{
 const s=createState();const c=run(s,'contact',{requirementId:'requirement-phones'});run(s,'contact',{requirementId:'requirement-phones'});assert.equal(s.collectorMarket.contacts.length,1);assert.equal(s.collectorMarket.orders.length,0);
 run(s,'contact_status',{contactId:c.id,status:'negotiating'});const o=run(s,'order',orderInput());assert.throws(()=>run(s,'order_status',{orderId:o.id,expectedVersion:99,status:'accepted'}),/changed/);
 run(s,'order_status',{orderId:o.id,expectedVersion:1,status:'cancelled',note:'Quantity unavailable'});assert.equal(s.collectorMarket.orders[0].cancellationReason,'Quantity unavailable');
});
test('collector API isolates workspaces and replays order requests without duplicates',async()=>{
 const env=await localBindings(await mkdtemp(path.join(tmpdir(),'collector-market-')));
 const post=(payload,code,p='/api/commands')=>worker.fetch(new Request('http://localhost'+p,{method:'POST',headers:{'Content-Type':'application/json',...(code?{Authorization:'Bearer '+code}:{})},body:JSON.stringify(payload)}),env);
 try{
  const {code}=await(await post({},null,'/api/spaces')).json();const other=await(await post({},null,'/api/spaces')).json();
  const command={operationId:newId('operation'),command:{type:'market_order',input:orderInput()}};
  assert.equal((await post(command)).status,401);const one=await post(command,code);assert.equal(one.status,200);const o=(await one.json()).result;const replay=await(await post(command,code)).json();assert.equal(replay.replayed,true);assert.equal(replay.result.id,o.id);
  assert.equal((await post({operationId:newId('operation'),command:{type:'market_order_status',input:{orderId:o.id,expectedVersion:1,status:'accepted'}}},other.code)).status,409);
  const state=await(await worker.fetch(new Request('http://localhost/api/state',{headers:{Authorization:'Bearer '+code}}),env)).json();assert.equal(state.state.collectorMarket.orders.length,1);
 }finally{env.close();}
});
