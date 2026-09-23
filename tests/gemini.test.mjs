import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {assessPhoto,validateAssessment} from '../server/gemini.js';
import {choices} from '../dist/waste-catalog.js';
import worker from '../server/worker.js';
import {localBindings} from '../scripts/local-backend.mjs';
const answer={status:'identified',items:[{code:'B01',evidence:'Keyboard and screen',approximateCount:1}],description:'Computer',uncertainty:'Function not tested',nextPhoto:''};
const lot={status:'mixed_lot',items:[{code:'B01',evidence:'Laptop',approximateCount:2},{code:'B02',evidence:'Phone',approximateCount:null}],description:'Mixed lot',uncertainty:'Counts approximate',nextPhoto:''};
test('catalog counts and provider schema enforce scope, no key in URL, no invented scores',async()=>{
 assert.equal(choices('broad').length,20);assert.equal(choices('detailed').length,106);
 let called=0;
 const result=await assessPhoto(new Uint8Array([255,216,255]),'image/jpeg','broad',{GEMINI_API_KEY:'secret',GEMINI_MODEL:'test-model'},async(url,options)=>{
  called++;assert(!url.includes('secret'));assert.equal(options.headers['x-goog-api-key'],'secret');
  const body=JSON.parse(options.body);assert.equal(body.generationConfig.responseJsonSchema.properties.items.items.properties.code.enum.length,20);
  return Response.json({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(answer)}]}}]});
 });
 assert.equal(called,1);assert.equal(result.items[0].code,'B01');assert.equal(result.items[0].approximateCount,1);assert.equal(result.confirmationRequired,true);assert.equal(result.score,undefined);
 assert.throws(()=>validateAssessment({...answer,items:[{code:'ITEW2',evidence:'x',approximateCount:null}]},'broad'),/unsupported category/);
 assert.equal(validateAssessment({...lot,status:'identified'},'broad').status,'mixed_lot','the listed items decide the status');
 assert.equal(validateAssessment({...lot,status:'identified'},'broad').modelStatus,'identified','model wording kept');
 assert.throws(()=>validateAssessment({...answer,items:[{code:'B01',evidence:'x',approximateCount:0}]},'broad'),/invalid count/);
 assert.deepEqual(validateAssessment(lot,'broad').items.map(i=>i.code),['B01','B02']);
 const repeated=validateAssessment({...lot,items:[{code:'B01',evidence:'Laptop',approximateCount:1},{code:'B01',evidence:'Desktop tower',approximateCount:1},{code:'B02',evidence:'Phones',approximateCount:null},{code:'B02',evidence:'Flip phone',approximateCount:1}]},'broad');
 assert.deepEqual(repeated.items,[{code:'B01',evidence:'Laptop; Desktop tower',approximateCount:2},{code:'B02',evidence:'Phones; Flip phone',approximateCount:null}],'repeats merge; unknown count stays unknown');
 assert.equal(validateAssessment({...answer,status:'needs_review'},'broad').status,'identified');
 assert.equal(validateAssessment({...answer,items:[],status:'identified'},'broad').status,'needs_review','no items means no category');
 assert.throws(()=>validateAssessment({...answer,status:'nonsense'},'broad'),/invalid assessment/);
 assert.equal(validateAssessment({...answer,status:'out_of_scope',items:[]},'broad').items.length,0);
 await assert.rejects(()=>assessPhoto(new Uint8Array(),'image/jpeg','broad',{}),/not configured/);
 await assert.rejects(()=>assessPhoto(new Uint8Array(),'image/jpeg','broad',{GEMINI_API_KEY:'x',GEMINI_MODEL:'test'},async()=>new Response('',{status:429})),/quota/);
});
test('shared demo persists photos, prices and decisions; isolates workspaces; missing key is honest',async()=>{
 const env=await localBindings(await mkdtemp(path.join(tmpdir(),'ewaste-identify-')));
 const request=async(p,body,code,method='POST')=>worker.fetch(new Request('http://localhost'+p,{method,headers:{...(code?{Authorization:'Bearer '+code}:{}),'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}),env);
 try{
  assert.equal((await request('/api/identification',null,null,'GET')).status,401);
  const {code}=await(await request('/api/spaces')).json();
  const other=await(await request('/api/spaces')).json();
  const id='item-'+crypto.randomUUID(),photoId='photo-'+crypto.randomUUID();
  const item={id,photoId,quantity:1,askingPricePaise:500000,priceBasis:'item'};
  assert.equal((await request('/api/identification/items',item,code)).status,400);
  const upload=await worker.fetch(new Request('http://localhost/api/photos/'+photoId,{method:'PUT',headers:{Authorization:'Bearer '+code},body:new Uint8Array([255,216,255])}),env);assert.equal(upload.status,200);
  assert.equal((await request('/api/identification/items',item,code)).status,200);
  assert.equal((await request('/api/identification/assess',{id,scope:'broad'},code)).status,503);
  assert.equal((await request('/api/identification/confirm',{id,scope:'broad',code:'B01',assessmentId:'fake'},code)).status,400);
  env.GEMINI_API_KEY='test-secret';env.GEMINI_MODEL='test-model';
  const originalFetch=globalThis.fetch;let providerCalls=0;
  try{
    globalThis.fetch=async()=>{providerCalls++;return Response.json({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(answer)}]}}]});};
    const assessment=await(await request('/api/identification/assess',{id,scope:'broad'},code)).json();
    assert.equal(assessment.items[0].code,'B01');assert(assessment.id);
    assert.equal((await request('/api/identification/assess',{id,scope:'broad'},code)).status,200);
    assert.equal(providerCalls,1,'persisted assessments are reused');
    assert.equal((await request('/api/identification/confirm',{id,scope:'broad',codes:['B02','B04'],assessmentId:assessment.id},code)).status,200);
    assert.equal((await request('/api/identification/confirm',{id,scope:'broad',codes:[],assessmentId:assessment.id},code)).status,400);
    assert.equal((await request('/api/identification/confirm',{id,scope:'broad',outcome:'not_ewaste',codes:['B01'],assessmentId:assessment.id},code)).status,400,'not e-waste carries no codes');
    const rejected=await(await request('/api/identification/confirm',{id,scope:'broad',outcome:'not_ewaste',assessmentId:assessment.id},code)).json();
    assert.equal(rejected.outcome,'not_ewaste');assert.equal(rejected.method,'corrected','AI identified a computer, so rejecting it is a correction');
    const retake=await(await request('/api/identification/confirm',{id,scope:'broad',outcome:'retake_photo',assessmentId:assessment.id},code)).json();
    assert.equal(retake.outcome,'retake_photo');
    const updated=await(await request('/api/identification',null,code,'GET')).json();
    assert.equal(updated.items[0].decisions[0].method,'corrected');
    assert.deepEqual(updated.items[0].decisions[0].codes,['B02','B04'],'a lot can confirm several categories');
    assert.deepEqual(updated.items[0].decisions[0].suggestedCodes,['B01'],'original suggestion kept beside the decision');
    assert.equal(updated.items[0].assessments[0].items[0].code,'B01','original prediction retained');
    assert.equal(updated.items[0].askingPricePaise,500000,'classification does not change price');
  }finally{globalThis.fetch=originalFetch;}
  assert.equal((await request('/api/identification/offer',{id,amountPaise:450000},code)).status,200);
  const saved=await(await request('/api/identification',null,code,'GET')).json();assert.equal(saved.items[0].offers[0].amountPaise,450000);assert.equal(saved.items[0].askingPricePaise,500000);
  assert.equal((await(await request('/api/identification',null,other.code,'GET')).json()).items.length,0);
  assert.equal((await request('/api/identification/assess',{id,scope:'detailed'},other.code)).status,404);
 }finally{env.close();}
});
test('a slow Gemini reply triggers one backup request and the first answer wins',async()=>{
 const reply=()=>Response.json({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(answer)}]}}]});
 let calls=0;
 const result=await assessPhoto(new Uint8Array([255,216,255]),'image/jpeg','broad',{GEMINI_API_KEY:'k',GEMINI_MODEL:'m',GEMINI_HEDGE_MS:'1'},async()=>{
  calls++;
  if(calls===1)return new Promise(()=>{}); // first request never answers
  return reply();
 });
 assert.equal(calls,2);assert.equal(result.items[0].code,'B01');
 let single=0;
 await assessPhoto(new Uint8Array([255,216,255]),'image/jpeg','broad',{GEMINI_API_KEY:'k',GEMINI_MODEL:'m',GEMINI_HEDGE_MS:'0'},async()=>{single++;return reply();});
 assert.equal(single,1,'hedging can be switched off');
 await assert.rejects(()=>assessPhoto(new Uint8Array([255,216,255]),'image/jpeg','broad',{GEMINI_API_KEY:'k',GEMINI_MODEL:'m'},async()=>new Response('{}',{status:503})),/overloaded/);
});
test('photo base64 already held by the photo store is sent as-is',async()=>{
  const bodies=[];const reply={candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify({status:'needs_review',items:[],description:'d',uncertainty:'u',nextPhoto:'n'})}]}}]};
  const fetcher=async(url,init)=>{bodies.push(JSON.parse(init.body));return new Response(JSON.stringify(reply),{status:200});};
  const env={GEMINI_API_KEY:'k',GEMINI_MODEL:'m',GEMINI_HEDGE_MS:'0'},bytes=new Uint8Array([255,216,255,1]);
  await assessPhoto(bytes,'image/jpeg','broad',env,fetcher,'STORED');
  await assessPhoto(bytes,'image/jpeg','broad',env,fetcher);
  assert.deepEqual(bodies.map(b=>b.contents[0].parts[1].inline_data.data),['STORED',Buffer.from(bytes).toString('base64')]);
});
