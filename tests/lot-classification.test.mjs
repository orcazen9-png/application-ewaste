import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import worker from '../server/worker.js';
import {localBindings} from '../scripts/local-backend.mjs';
import {createState,saveLot,newId} from '../dist/domain.js';
import {lotInput} from '../dist/sync.js';
import {normalizeLotClassification,assessLotPhoto} from '../dist/lot-classification.js';

const answer={status:'mixed_lot',items:[{code:'B01',evidence:'Laptop screen',approximateCount:1},{code:'B02',evidence:'Phone',approximateCount:1}],description:'Laptop and phone',uncertainty:'Function not tested',nextPhoto:''};
const assessment=photoId=>({...answer,id:newId('assessment'),photoId,scope:'broad',model:'test-model',taxonomyVersion:'test',createdAt:new Date().toISOString()});
const base=()=>({id:newId('lot'),materialId:'cables',locality:'Mumbai',weight:'2',photoId:newId('photo')});
const choice=(photoId,codes)=>({photoId,codes,outcome:'categories'});

test('lot classification needs human confirmation, supports corrections, survives sync input and clears with a replaced photo',()=>{
  const state=createState(),input=base(),a=assessment(input.photoId);
  const draft=saveLot(state,{...input,wasteAssessment:a});
  assert.equal(draft.wasteDecision,null);
  assert.throws(()=>saveLot(state,{...input,wasteAssessment:a},{publish:true}),/Confirm or correct/);
  const confirmed=saveLot(state,{...input,wasteAssessment:a,wasteDecision:choice(input.photoId,['B01','B02'])},{publish:true});
  assert.equal(confirmed.wasteDecision.method,'confirmed');
  const corrected=saveLot(state,{...input,wasteAssessment:a,wasteDecision:choice(input.photoId,['B03'])},{publish:true});
  assert.equal(corrected.wasteDecision.method,'corrected');
  assert.deepEqual(corrected.wasteAssessment.items.map(i=>i.code),['B01','B02']);
  assert.deepEqual(corrected.estimate,confirmed.estimate,'photo classification never changes material pricing');
  const shared=createState(),synced=saveLot(shared,lotInput(corrected,state),{publish:true});
  assert.deepEqual(synced.wasteDecision,corrected.wasteDecision);
  assert.deepEqual(synced.wasteAssessment,corrected.wasteAssessment);
  const legacy=saveLot(state,input,{publish:true});
  assert.deepEqual(legacy.wasteDecision,corrected.wasteDecision,'older clients preserve the decision for the same photo');
  const replaced=saveLot(state,{...input,photoId:newId('photo')},{publish:true});
  assert.equal(replaced.wasteAssessment,null);assert.equal(replaced.wasteDecision,null);
  assert.throws(()=>normalizeLotClassification({...input,wasteAssessment:assessment(newId('photo'))}),/does not belong/);
  assert.throws(()=>normalizeLotClassification({...input,wasteDecision:choice(input.photoId,['ITEW2'])}),/supported waste/);
  assert.throws(()=>saveLot(createState(),{...input,wasteDecision:{photoId:input.photoId,outcome:'retake_photo',codes:[]}},{publish:true}),/Replace the photo/);
});

test('Create Lot uploads and assesses the same photo, caches results, isolates workspaces, and verifies evidence on listing',async()=>{
  const env=await localBindings(await mkdtemp(path.join(tmpdir(),'ewaste-lot-photo-')));
  const originalFetch=globalThis.fetch;let providerCalls=0;
  const api=(url,init={})=>worker.fetch(new Request(url,init),env);
  const post=async(p,value,code)=>api('http://localhost'+p,{method:'POST',headers:{'Content-Type':'application/json',...(code?{Authorization:'Bearer '+code}:{})},body:JSON.stringify(value)});
  try{
    env.GEMINI_API_KEY='unit-test-key';env.GEMINI_MODEL='test-model';
    globalThis.fetch=async()=>{providerCalls++;return Response.json({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(answer)}]}}]});};
    const {code}=await(await post('/api/spaces',{})).json();
    const other=await(await post('/api/spaces',{})).json();
    const input=base();
    assert.equal((await post('/api/lot-assessments',{photoId:input.photoId})).status,401);
    assert.equal((await post('/api/lot-assessments',{photoId:input.photoId},code)).status,404);
    const blob=new Blob([new Uint8Array([255,216,255])],{type:'image/jpeg'});
    const result=await assessLotPhoto(blob,input.photoId,{endpoint:'http://localhost',code},{fetcher:api});
    assert.equal(providerCalls,1);assert.equal(result.items.length,2);
    await assessLotPhoto(blob,input.photoId,{endpoint:'http://localhost',code},{fetcher:api});
    assert.equal(providerCalls,1,'retries reuse the saved assessment instead of calling Gemini again');
    assert.equal((await post('/api/lot-assessments',{photoId:input.photoId},other.code)).status,404);
    const publish={type:'list',input:{...input,wasteAssessment:{...result,description:'forged text'},wasteDecision:choice(input.photoId,['B02'])}};
    const operationId=newId('operation');
    const response=await post('/api/commands',{operationId,command:publish},code);
    assert.equal(response.status,200);
    const saved=(await response.json()).result;
    assert.equal(saved.wasteAssessment.description,answer.description,'server uses stored provider evidence');
    assert.equal(saved.wasteDecision.method,'corrected');
    assert.deepEqual(saved.wasteDecision.codes,['B02']);
    assert.equal((await post('/api/commands',{operationId,command:publish},code)).status,200,'same operation retries safely');
    publish.input={...publish.input,expectedVersion:saved.version,wasteAssessment:{...result,id:newId('assessment')}};
    assert.equal((await post('/api/commands',{operationId:newId('operation'),command:publish},code)).status,400,'unknown assessment cannot be attached');
    delete env.GEMINI_API_KEY;
    const missing=base();
    await assert.rejects(()=>assessLotPhoto(blob,missing.photoId,{endpoint:'http://localhost',code},{fetcher:api}),/not configured/);
  }finally{globalThis.fetch=originalFetch;env.close();}
});
