import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../server/worker.js';
import {setup} from './helpers/logistics-fixture.mjs';
const id=()=>crypto.randomUUID(),future=days=>new Date(Date.now()+days*86400000).toISOString();
const pdf='%PDF-1.7\n1 0 obj<</Type/Catalog>>endobj\n%%EOF';
async function prepare(t){
 const f=await setup(t),r=await f.user('recycler',false),doc=id();
 const file=(u,d=doc,method='PUT',data=pdf,mime='application/pdf')=>worker.fetch(new Request('https://test.example/api/v1/facility/documents/'+d+'?name=Registration.pdf',{method,headers:{Authorization:'Bearer '+u.token,'Content-Type':mime},...(method==='PUT'?{body:data}:{})}),f.env);
 assert.equal((await file(r)).status,201);
 const profile={name:'Mumbai recovery facility',address:'12 Industrial Road',locality:'Mumbai',contact:'Facility desk',hours:'Monday to Saturday 9–6',areas:'Mumbai, Thane',authority:'Issuing authority as printed on document',registration:'TEST-001',categories:['B01'],documentIds:[doc],documentExpiry:future(90).slice(0,10),pickup:true};
 const save=(version,submit=true,p=profile)=>f.ok(r,'/facility','PUT',{commandId:id(),expectedVersion:version,submit,profile:p});
 const review=(version,submissionVersion,extra={})=>({commandId:id(),expectedVersion:version,submissionVersion,decision:'approved',reason:'Document and facility scope checked',source:'Submitted registration and issuer reference',validUntil:future(30),...extra});
 return {...f,r,doc,profile,file,save,review};
}
test('facility drafts, immutable submission, review, rejection and resubmission preserve history',async t=>{
 const f=await prepare(t);assert.equal((await f.ok(f.r,'/facility')).version,0);
 await f.save(0,false);await f.save(1);const submitted=await f.okOps('/facilities/'+f.r.facility);assert.equal(submitted.status,'pending');assert.equal(submitted.submissions[0].version,2);
 const input=f.review(2,2);await f.okOps('/facilities/'+f.r.facility+'/review','POST',input);assert.equal((await f.okOps('/facilities/'+f.r.facility+'/review','POST',input)).replayed,true);
 let approved=await f.ok(f.r,'/facility');assert.equal(approved.status,'approved');assert.equal(approved.reviews.length,1);assert.equal((await f.ok(f.r,'/notifications')).notifications[0].kind,'facility.review');
 await f.requirement(f.r);
 const reject=f.review(3,2,{decision:'rejected',reason:'New information needs a revised document'});await f.okOps('/facilities/'+f.r.facility+'/review','POST',reject);
 await f.save(4,true,{...f.profile,name:'Corrected facility'});const detail=await f.okOps('/facilities/'+f.r.facility);assert.equal(detail.status,'pending');assert.equal(detail.submissions.length,2);assert.equal(detail.submissions[1].profile.name,f.profile.name);assert.equal(detail.reviews.length,2);
 assert.equal((await f.ops('/facilities/'+f.r.facility+'/review','POST',f.review(3,2))).status,409);
});
test('facility evidence is private, immutable, validated and restricted to operations reviewers',async t=>{
 const f=await prepare(t),other=await f.user('recycler',false);
 assert.equal((await f.call(f.c,'/facility')).status,403);assert.equal((await f.file(other,f.doc,'GET')).status,404);
 assert.equal((await f.ops('/facilities/'+f.r.facility+'/documents/'+f.doc)).status,404);
 assert.equal((await f.file(f.r,f.doc,'PUT',pdf+'\nchange')).status,409);
 assert.equal((await f.file(f.r,id(),'PUT','not a PDF')).status,415);
 assert.equal((await f.file(f.r,id(),'PUT',pdf,'image/png')).status,415);
 assert.equal((await f.call(other,'/facility','PUT',{commandId:id(),expectedVersion:0,submit:true,profile:f.profile})).status,404);
 await f.save(0);const response=await f.ops('/facilities/'+f.r.facility+'/documents/'+f.doc);assert.equal(response.status,200);assert.equal(await response.text(),pdf);assert.match(response.headers.get('cache-control'),/no-store/);
 for(const role of ['finance','viewer']){await f.env.DB.prepare('UPDATE operations_staff SET role=? WHERE id=?').bind(role,f.staff).run();assert.equal((await f.ops('/facilities')).status,403);assert.equal((await f.ops('/facilities/'+f.r.facility+'/documents/'+f.doc)).status,403);}
});
test('facility approval scope and expiry gate new business without rewriting existing orders',async t=>{
 const f=await prepare(t);await f.save(0);
 const candidate={commandId:id(),expectedVersion:0,broadCode:'B01',title:'Computers',unit:'kg',rate:'50',minimum:'1',target:'500',areas:['Mumbai'],modes:['pickup'],validUntil:future(15),state:'active'};
 assert.equal((await f.call(f.r,'/requirements/'+id(),'PUT',candidate)).status,403);
 assert.equal((await f.ops('/facilities/'+f.r.facility+'/review','POST',f.review(1,1,{validUntil:future(100)}))).status,400);
 await f.okOps('/facilities/'+f.r.facility+'/review','POST',f.review(1,1));
 assert.equal((await f.call(f.r,'/requirements/'+id(),'PUT',{...candidate,commandId:id(),broadCode:'B02'})).status,403);
 const req=await f.requirement(f.r),lot=await f.lot(f.c),request=await f.request(f.c,lot,req),order=await f.ok(f.r,'/requests/'+request.id+'/accept','POST',{commandId:id(),expectedVersion:1});
 const pending=await f.request(f.c,lot,req,{quantity:'20'});
 await f.env.DB.prepare("UPDATE facility_profiles SET valid_until='2000-01-01T00:00:00.000Z' WHERE facility_id=?").bind(f.r.facility).run();
 assert.equal((await f.ok(f.r,'/facility')).status,'expired');
 assert.equal((await f.ok(f.c,'/matches?lotId='+lot.id+'&itemId='+lot.itemId)).matches.some(r=>r.id===req.id),false);
 assert.equal((await f.call(f.r,'/requests/'+pending.id+'/accept','POST',{commandId:id(),expectedVersion:1})).status,403);
 assert.equal((await f.ok(f.r,'/orders/'+order.id)).order.state,'accepted');
 await assert.rejects(async()=>f.env.DB.prepare('UPDATE requirements SET title=? WHERE id=?').bind('New title',req.id).run(),/Facility review changed/);
});
test('concurrent submissions and review decisions commit once and require current version',async t=>{
 const f=await prepare(t),payload={commandId:id(),expectedVersion:0,submit:true,profile:f.profile};
 const answers=await Promise.all([f.call(f.r,'/facility','PUT',payload),f.call(f.r,'/facility','PUT',payload)]);assert.deepEqual(answers.map(r=>r.status),[200,200]);
 const decisions=await Promise.all([f.ops('/facilities/'+f.r.facility+'/review','POST',f.review(1,1)),f.ops('/facilities/'+f.r.facility+'/review','POST',f.review(1,1,{decision:'rejected'}))]);assert.deepEqual(decisions.map(r=>r.status).sort(),[200,409]);
 const d=await f.ok(f.r,'/facility');assert.equal(d.reviews.length,1);
 assert.equal((await f.call(f.r,'/facility','PUT',{...payload,commandId:id()})).status,409);
});
