import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import worker from '../server/worker.js';
import {localBindings} from '../scripts/local-backend.mjs';
import {newId,saveLot} from '../dist/domain.js';
import {transact} from '../dist/transactions.js';
test('device drafts survive connection; lost replies retry once and stale edits become recoverable drafts',async()=>{
  globalThis.window=new EventTarget();globalThis.location={origin:'http://127.0.0.1:5173'};Object.defineProperty(navigator,'onLine',{value:true,configurable:true});
  const env=await localBindings(await mkdtemp(path.join(tmpdir(),'ewaste-sync-'))),originalFetch=globalThis.fetch;let drop=false;
  globalThis.fetch=async(url,init)=>{const response=await worker.fetch(new Request(url,init),env);if(drop&&String(url).endsWith('/api/commands')){drop=false;throw new Error('Test connection lost after server commit');}return response;};
  try{
    const {readState,changeState}=await import('../dist/store.js');const {connectWorkspace,queueListing,synchronize}=await import('../dist/sync.js');
    const photoId=newId('photo');const initial=await changeState(s=>saveLot(s,{materialId:'cables',locality:'Mumbai',weight:'12.5',photoId}),{photo:{id:photoId,blob:new Blob([new Uint8Array([137,80,78,71,13,10,26,10])],{type:'image/png'})}});
    const id=initial.result.id;const config=await connectWorkspace(location.origin,'',true);assert.equal((await readState()).lots[0].status,'draft');
    let captured;
    await changeState(s=>{const previous=s.lots[0];const lot=saveLot(s,{...previous,expectedVersion:previous.version},{publish:true});captured=structuredClone(lot.originalEstimate);queueListing(s,lot,previous);});
    drop=true;await assert.rejects(synchronize());assert.equal((await readState()).outbox.length,1);
    await synchronize();const synced=await readState();assert.equal(synced.outbox.length,0);assert.equal(synced.lots.filter(l=>l.id===id).length,1);assert.equal(synced.lots[0].storage,'synced');assert.deepEqual(synced.lots[0].originalEstimate,captured);
    const remote=async()=>JSON.parse(await(await worker.fetch(new Request(location.origin+'/api/state',{headers:{Authorization:`Bearer ${config.code}`}}),env)).text()).state;
    const before=await remote();assert.equal(before.lots.length,1);assert.equal(before.events.filter(e=>e.type==='listed').length,1);
    const otherCommand={operationId:newId('operation'),command:{type:'list',input:{id,materialId:'cables',locality:'Mumbai',weight:'15',photoId,expectedVersion:before.lots[0].version}}};
    assert.equal((await worker.fetch(new Request(location.origin+'/api/commands',{method:'POST',headers:{Authorization:`Bearer ${config.code}`},body:JSON.stringify(otherCommand)}),env)).status,200);
    await changeState(s=>{const previous=s.lots.find(l=>l.id===id);const lot=saveLot(s,{...previous,weight:'14',expectedVersion:previous.version},{publish:true});queueListing(s,lot,previous);});
    await assert.rejects(synchronize());const recovered=await readState();assert.equal(recovered.lots.find(l=>l.id===id).weight,'15');assert(recovered.lots.some(l=>l.sourceLotId===id&&l.weight==='14'&&l.status==='draft'));assert.equal(recovered.outbox.length,0);
    const sampleState=structuredClone(recovered);transact(sampleState,{type:'sample',input:{photoId}});assert.equal(sampleState.lots.filter(l=>l.isSample).length,1);transact(sampleState,{type:'reset_samples'});assert.equal(sampleState.lots.length,recovered.lots.length);assert(sampleState.lots.every(l=>!l.isSample));
  }finally{globalThis.fetch=originalFetch;env.close();}
});
