import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './helpers/market-fixture.mjs';
const id=()=>crypto.randomUUID();
const cmd=(extra={})=>({commandId:id(),expectedVersion:0,...extra});
async function publish(f,c,l){await f.ok(c,'/listings/'+l.id,'PUT',cmd({lotVersion:1,state:'posted',sharePhotos:true,location:null}));}
test('delete hides the lot, withdraws pending offers, syncs a tombstone and cannot be reversed by a stale save',async t=>{
 const f=await fixture(t),c=await f.user(),other=await f.user(),r=await f.user('recycler'),l=await f.lot(c),req=await f.requirement(r);await publish(f,c,l);const offer=await f.request(c,l,req);
 const input=cmd({expectedVersion:1});assert.equal((await f.call(other,'/lots/'+l.id,'DELETE',input)).status,404);assert.equal((await f.call(r,'/lots/'+l.id,'DELETE',input)).status,403);
 assert.equal((await f.call(c,'/lots/'+l.id,'DELETE',cmd({expectedVersion:0}))).status,409);
 await f.ok(c,'/lots/'+l.id,'DELETE',input);assert.equal((await f.ok(c,'/lots/'+l.id,'DELETE',input)).replayed,true);
 assert.equal((await f.ok(c,'/lots')).lots.length,0);assert.deepEqual((await f.ok(c,'/lots')).deletedLots,[l.id]);assert.equal((await f.ok(r,'/listings')).lots.length,0);assert.equal((await f.call(r,'/listings/'+l.id)).status,404);
 assert.equal((await f.ok(r,'/requests/'+offer.id)).request.state,'withdrawn');
 assert.equal((await f.call(c,'/lots/'+l.id,'PUT',{...l.input,commandId:id(),expectedVersion:1})).status,410);
 assert.equal((await f.call(c,'/listings/'+l.id,'PUT',cmd({expectedVersion:2,lotVersion:1,state:'posted',sharePhotos:true}))).status,410);
 assert.equal((await f.call(r,'/requests/'+offer.id+'/accept','POST',cmd({expectedVersion:2,offerVersion:1}))).status,409);
});
test('active reservations block deletion, cancellation allows removal and order history survives',async t=>{
 const f=await fixture(t),c=await f.user(),r=await f.user('recycler'),l=await f.lot(c),req=await f.requirement(r),offer=await f.request(c,l,req);
 const accepted=await f.ok(r,'/requests/'+offer.id+'/accept','POST',cmd({expectedVersion:1,offerVersion:1}));
 assert.equal((await f.call(c,'/lots/'+l.id,'DELETE',cmd({expectedVersion:1}))).status,409);
 await f.ok(c,'/orders/'+accepted.id+'/cancel','POST',cmd({expectedVersion:1,message:'Collection cancelled'}));await f.ok(c,'/lots/'+l.id,'DELETE',cmd({expectedVersion:1}));
 assert.equal((await f.ok(r,'/orders/'+accepted.id)).order.state,'cancelled');
});
test('lot conversations are private, retry-safe and persist alongside offers and after deletion',async t=>{
 const f=await fixture(t),c=await f.user(),r=await f.user('recycler'),stranger=await f.user('recycler'),l=await f.lot(c);await publish(f,c,l);
 const start=cmd({lotId:l.id});const chat=await f.ok(r,'/conversations','POST',start);assert.equal((await f.ok(r,'/conversations','POST',start)).id,chat.id);
 assert.equal((await f.ok(c,'/conversations','POST',cmd({lotId:l.id,recyclerId:r.id}))).id,chat.id);
 const message=cmd({message:'Can you collect tomorrow?'});await f.ok(c,'/conversations/'+chat.id+'/messages','POST',message);await f.ok(c,'/conversations/'+chat.id+'/messages','POST',message);
 await f.ok(r,'/conversations/'+chat.id+'/messages','POST',cmd({message:'Yes, after 10am.'}));
 const detail=await f.ok(c,'/conversations/'+chat.id);assert.equal(detail.messages.length,2);assert.equal(detail.messages[0].message,'Can you collect tomorrow?');assert.equal(detail.conversation.recyclerName,'Test account');
 assert.equal((await f.call(stranger,'/conversations/'+chat.id)).status,404);assert.equal((await f.call(stranger,'/conversations/'+chat.id+'/messages','POST',cmd({message:'intrusion'}))).status,404);
 assert.equal((await f.ok(r,'/notifications')).notifications.some(x=>x.kind==='chat.message'),true);
 const req=await f.requirement(r),offer=await f.request(c,l,req);assert.equal((await f.ok(r,'/conversations/'+chat.id)).offers[0].id,offer.id);
 await f.ok(c,'/requests/'+offer.id+'/message','POST',cmd({expectedVersion:1,message:'Legacy offer reply'}));assert.equal((await f.ok(r,'/conversations/'+chat.id)).messages.length,3);
 await f.ok(c,'/lots/'+l.id,'DELETE',cmd({expectedVersion:1}));assert.equal((await f.ok(r,'/conversations/'+chat.id)).offers[0].state,'withdrawn');
 await f.ok(r,'/conversations/'+chat.id+'/messages','POST',cmd({message:'Understood.'}));assert.equal((await f.ok(c,'/conversations/'+chat.id)).messages.length,4);
});
test('conversation pagination has no duplicate messages and stale offer acceptance is still blocked',async t=>{
 const f=await fixture(t),c=await f.user(),r=await f.user('recycler'),l=await f.lot(c);await publish(f,c,l);const chat=await f.ok(r,'/conversations','POST',cmd({lotId:l.id}));
 for(let i=0;i<53;i++)await f.env.DB.prepare('INSERT INTO chat_messages VALUES(?,?,?,?,?)').bind(id(),chat.id,c.id,'Message '+i,new Date(Date.now()+i*1000).toISOString()).run();
 const first=await f.ok(r,'/conversations/'+chat.id),older=await f.ok(r,'/conversations/'+chat.id+'?before='+encodeURIComponent(first.olderCursor));assert.equal(first.messages.length,50);assert.equal(older.messages.length,3);assert.equal(new Set([...first.messages,...older.messages].map(x=>x.id)).size,53);
 const req=await f.requirement(r),offer=await f.request(c,l,req);await f.ok(c,'/requests/'+offer.id+'/quote','POST',cmd({expectedVersion:1,offerVersion:1,amount:'12000',message:'New price'}));
 assert.equal((await f.call(r,'/requests/'+offer.id+'/accept','POST',cmd({expectedVersion:2,offerVersion:1}))).status,409);
 const accepted=await f.ok(r,'/requests/'+offer.id+'/accept','POST',cmd({expectedVersion:2,offerVersion:2}));assert.equal((await f.ok(r,'/orders/'+accepted.id)).order.materialAmount,'12000.00');
});
