import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import http from 'node:http';
import worker from '../server/worker.js';
import {localBindings} from '../scripts/local-backend.mjs';
import {newId,ledger} from '../dist/domain.js';
test('two HTTP clients share durable records; competing accepts and repeated payment are atomic',async()=>{
  const directory=await mkdtemp(path.join(tmpdir(),'ewaste-backend-'));let env=await localBindings(directory);
  const server=http.createServer(async(req,res)=>{const chunks=[];for await(const c of req)chunks.push(c);const response=await worker.fetch(new Request('http://localhost'+req.url,{method:req.method,headers:req.headers,...(req.method==='GET'?{}:{body:Buffer.concat(chunks)})}),env);res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${server.address().port}`;
  try{
    const space=await (await fetch(base+'/api/spaces',{method:'POST'})).json();const code=space.code;
    const api=(p,options={},key=code)=>fetch(base+p,{...options,headers:{Authorization:`Bearer ${key}`,...options.headers}});
    const state=async()=> (await (await api('/api/state')).json()).state;
    const command=async(cmd,id=newId('operation'))=>{const response=await api('/api/commands',{method:'POST',body:JSON.stringify({operationId:id,command:cmd})});return {status:response.status,...await response.json()};};
    const lotId=newId('lot'),photoId=newId('photo');
    const lot={type:'list',input:{id:lotId,photoId,materialId:'cables',locality:'Mumbai',weight:'12.5'}};
    assert.equal((await command(lot)).status,400,'missing uploaded photo prevents listing');
    assert.equal((await api('/api/photos/'+photoId,{method:'PUT',body:new Uint8Array([137,80,78,71,13,10,26,10])})).status,200);
    const listingOperation=newId('operation');assert.equal((await command(lot,listingOperation)).status,200);assert.equal((await command(lot,listingOperation)).replayed,true);
    assert.equal((await state()).lots.length,1);assert.equal((await api('/api/state',{},'a'.repeat(48))).status,401);
    const other=await(await fetch(base+'/api/spaces',{method:'POST'})).json();assert.equal((await api('/api/photos/'+photoId,{},other.code)).status,404);
    assert.equal((await command({type:'cancel',lotId})).status,409,'version is mandatory');
    const a=(await command({type:'offer',lotId,expectedVersion:1,input:{buyerId:'buyer-green'}})).result;
    const b=(await command({type:'offer',lotId,expectedVersion:1,input:{buyerId:'buyer-circle'}})).result;
    const accepts=await Promise.all([a,b].map(offer=>command({type:'accept',lotId,expectedVersion:1,input:{offerId:offer.id}})));
    assert.deepEqual(accepts.map(r=>r.status).sort(),[200,409]);assert.equal((await state()).offers.filter(o=>o.status==='accepted').length,1);
    async function act(type,input={}){const current=await state();const result=await command({type,lotId,expectedVersion:current.lots[0].version,input});assert.equal(result.status,200,JSON.stringify(result));return result.result;}
    await act('schedule',{slot:new Date(Date.now()+86400000).toISOString(),instructions:'Test depot'});await act('advance');await act('advance');await act('handover',{weight:'11.125',location:'Test depot',photoId});await act('confirm');
    const before=await state(),payment={type:'payment',lotId,expectedVersion:before.lots[0].version,input:{amount:'100'}},paymentOperation=newId('operation');
    const retries=await Promise.all([command(payment,paymentOperation),command(payment,paymentOperation)]);assert(retries.every(r=>r.status===200));assert.equal((await state()).payments.length,1);assert.equal(ledger(await state()).receivedPaise,10000);
    assert.equal((await command({...payment,input:{amount:'200'}},paymentOperation)).status,409,'same ID cannot carry different amount');
    const totals=ledger(await state());await act('payment',{amount:(totals.outstandingPaise/100).toFixed(2)});assert.equal(ledger(await state()).outstandingPaise,0);
    env.close();env=await localBindings(directory);assert.equal((await state()).lots[0].status,'completed','survives server restart');
    const unauthenticated=await worker.fetch(new Request('https://example.test/api/spaces',{method:'POST'}),{...env,LOCAL_DEMO:false});assert.equal(unauthenticated.status,401);
  }finally{await new Promise(resolve=>server.close(resolve));env.close();}
});
