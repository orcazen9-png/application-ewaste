import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './helpers/market-fixture.mjs';
import {setup} from './helpers/logistics-fixture.mjs';
const id=()=>crypto.randomUUID(),future=d=>new Date(Date.now()+d*86400000).toISOString();
async function publish(f,c,lot,extra={}){return f.ok(c,'/listings/'+lot.id,'PUT',{commandId:id(),expectedVersion:0,lotVersion:1,state:'posted',sharePhotos:true,location:{latitude:19.076,longitude:72.8777},...extra});}
test('only intentionally posted current lots appear; location filters, photo access and private notes stay scoped',async t=>{
 const f=await fixture(t),c=await f.user(),r=await f.user('recycler'),other=await f.user(),l=await f.lot(c);
 assert.equal((await f.ok(r,'/listings')).lots.length,0);assert.equal((await f.call(r,'/listings/'+l.id)).status,404);
 const p=await publish(f,c,l);assert.equal(p.version,1);
 const detail=await f.ok(r,'/listings/'+l.id);assert.equal(detail.lot.notes,undefined);assert.deepEqual(detail.lot.location,{latitude:19.08,longitude:72.88});
 assert.equal((await f.ok(r,'/listings?lat=19.08&lon=72.88&radius=10&material=B01')).lots.length,1);
 assert.equal((await f.ok(r,'/listings?lat=28.61&lon=77.2&radius=10')).lots.length,0);
 assert.equal((await f.call(other,'/listings/'+l.id)).status,404);
 assert.equal((await f.call(r,'/listings?lat=999&lon=72')).status,400);
 await f.ok(c,'/lots/'+l.id,'PUT',{...l.input,commandId:id(),expectedVersion:1,title:'Changed privately'});
 assert.equal((await f.ok(r,'/listings')).lots.length,0,'editing invalidates publication until explicitly posted again');
 await publish(f,c,l,{expectedVersion:1,lotVersion:2,state:'paused'});
 assert.equal((await f.call(r,'/listings/'+l.id)).status,404);
});
test('recycler initiates an offer, both parties converse and counter, only the current recipient can accept',async t=>{
 const f=await fixture(t),c=await f.user(),r=await f.user('recycler'),stranger=await f.user('recycler'),l=await f.lot(c),req=await f.requirement(r);
 await publish(f,c,l);const rid=id(),input={commandId:id(),lotId:l.id,itemId:l.itemId,lotVersion:1,listingVersion:1,requirementId:req.id,requirementVersion:1,quantity:'200',mode:'pickup',ask:'10000.00',sharePhotos:true};
 await f.ok(r,'/requests/'+rid,'POST',input);assert.equal((await f.ok(r,'/requests/'+rid,'POST',input)).replayed,true);
 assert.equal((await f.call(stranger,'/requests/'+rid)).status,404);
 assert.equal((await f.call(r,'/requests/'+rid+'/accept','POST',{commandId:id(),expectedVersion:1,offerVersion:1})).status,403);
 const message={commandId:id(),expectedVersion:1,message:'Can you collect tomorrow?'};
 await f.ok(c,'/requests/'+rid+'/message','POST',message);await f.ok(c,'/requests/'+rid+'/message','POST',message);
 assert.equal((await f.ok(c,'/requests/'+rid)).events.filter(e=>e.kind==='message').length,1);
 const quote={commandId:id(),expectedVersion:1,offerVersion:1,amount:'11000.00',message:'Please include all 200 kg.'};await f.ok(c,'/requests/'+rid+'/quote','POST',quote);
 assert.equal((await f.call(c,'/requests/'+rid+'/accept','POST',{commandId:id(),expectedVersion:2,offerVersion:2})).status,403);
 assert.equal((await f.call(r,'/requests/'+rid+'/accept','POST',{commandId:id(),expectedVersion:2,offerVersion:1})).status,409);
 const accepted=await f.ok(r,'/requests/'+rid+'/accept','POST',{commandId:id(),expectedVersion:2,offerVersion:2});
 const order=await f.ok(c,'/orders/'+accepted.id);assert.equal(order.order.materialAmount,'11000.00');assert.equal(order.terms[0].proposedBy,c.id);assert.equal(order.terms[0].acknowledgedBy,r.id);
 assert.equal((await f.ok(c,'/notifications')).notifications.some(n=>n.kind==='market.quote'),true);
});
test('pausing a lot prevents pending offer acceptance; concurrent counters have one winner',async t=>{
 const f=await fixture(t),c=await f.user(),r=await f.user('recycler'),l=await f.lot(c),req=await f.requirement(r);await publish(f,c,l);
 const rid=id();await f.ok(r,'/requests/'+rid,'POST',{commandId:id(),lotId:l.id,itemId:l.itemId,lotVersion:1,listingVersion:1,requirementId:req.id,requirementVersion:1,quantity:'200',mode:'pickup',ask:'10000',sharePhotos:true});
 const responses=await Promise.all([c,r].map(u=>f.call(u,'/requests/'+rid+'/quote','POST',{commandId:id(),expectedVersion:1,offerVersion:1,amount:'12000',message:'Counter'})));assert.deepEqual(responses.map(x=>x.status).sort(),[200,409]);
 const current=(await f.ok(c,'/requests/'+rid)).request;await publish(f,c,l,{expectedVersion:1,state:'paused'});
 const recipient=current.proposedBy===c.id?r:c;assert.equal((await f.call(recipient,'/requests/'+rid+'/accept','POST',{commandId:id(),expectedVersion:2,offerVersion:2})).status,409);
});
test('authorized directory requires consent, current source verification and reviewed scope; demo grants cannot qualify',async t=>{
 const f=await setup(t),r=f.r||f.recycler; // Use a separate facility so the fixture order remains unchanged.
 const recycler=await f.user('recycler'),facility=recycler.facility;
 const profile={name:'Registered recovery',address:'Industrial Road',locality:'Mumbai',contact:'Business desk',phone:'+919000000000',email:'desk@example.test',hours:'9 to 6',areas:'Mumbai',categories:['B01'],pickup:true,authority:'Example authority',registration:'TEST ONLY',documentIds:[id()],directoryConsent:true,location:{latitude:19.08,longitude:72.88}};
 await f.env.DB.prepare("INSERT INTO facility_profiles VALUES(?,2,'approved',?,1,?,?)").bind(facility,JSON.stringify(profile),future(30),new Date().toISOString()).run();
 assert.equal((await f.ok(f.c,'/directory')).recyclers.length,0,'internal review alone is insufficient');
 const input={commandId:id(),expectedVersion:0,submissionVersion:1,status:'verified',confirmed:true,source:'https://authority.example.test/register/TEST',validUntil:future(20)};
 await f.okOps('/facilities/'+facility+'/authorization','POST',input);
 assert.equal((await f.okOps('/facilities/'+facility+'/authorization','POST',input)).replayed,true);
 let directory=await f.ok(f.c,'/directory?lat=19.08&lon=72.88&radius=10&material=B01&pickup=true');assert.equal(directory.recyclers.length,1);assert.equal(directory.recyclers[0].documentIds,undefined);assert.equal(directory.recyclers[0].authorization.status,'verified');
 await f.env.DB.prepare("UPDATE facility_profiles SET submitted_version=3,version=3 WHERE facility_id=?").bind(facility).run();assert.equal((await f.ok(f.c,'/directory')).recyclers.length,0,'new submission invalidates prior government-source review');
});
