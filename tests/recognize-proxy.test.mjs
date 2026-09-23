import test from 'node:test';
import assert from 'node:assert/strict';
import {createRecognizeHandler,DEFAULT_RECOGNITION_URL} from '../scripts/recognize-proxy.mjs';

const request=(chunks,type='image/jpeg')=>({headers:{'content-type':type},async *[Symbol.asyncIterator](){for(const c of chunks)yield c;}});
const response=()=>{const out={chunks:[]};return {writeHead(status,headers){out.status=status;out.headers=headers;},end(body){out.body=body?String(body):'';},out};};

test('photos are forwarded to the loopback recognition service only', async()=>{
  const seen=[];
  const handler=createRecognizeHandler({url:'http://127.0.0.1:8766/predict',fetchImpl:async(url,options)=>{seen.push({url,type:options.headers['Content-Type'],bytes:options.body.length});return Response.json({scope:'itew',candidates:[{code:'ITEW24',score:.8}]});}});
  const res=response();
  await handler(request([Buffer.from('abc'),Buffer.from('de')]),res);
  assert.equal(DEFAULT_RECOGNITION_URL,'http://127.0.0.1:8766/predict');
  assert.deepEqual(seen,[{url:'http://127.0.0.1:8766/predict',type:'image/jpeg',bytes:5}]);
  assert.equal(res.out.status,200);
  assert.equal(res.out.headers['Cache-Control'],'no-store');
  assert.equal(JSON.parse(res.out.body).candidates[0].code,'ITEW24');
});

test('a stopped or failing recognition service returns 503, never a guess', async()=>{
  const handler=createRecognizeHandler({fetchImpl:async()=>{throw new Error('ECONNREFUSED');}});
  const res=response();
  await handler(request([Buffer.from('x')]),res);
  assert.equal(res.out.status,503);
  assert.match(JSON.parse(res.out.body).detail,/not running/);
});

test('the untrained-model status is passed through unchanged', async()=>{
  const handler=createRecognizeHandler({fetchImpl:async()=>new Response('{"detail":"No trained ITEW model yet."}',{status:503})});
  const res=response();
  await handler(request([Buffer.from('x')]),res);
  assert.equal(res.out.status,503);
  assert.match(JSON.parse(res.out.body).detail,/No trained ITEW model/);
});

test('oversized uploads are rejected before any forwarding', async()=>{
  let called=false;
  const handler=createRecognizeHandler({limitBytes:10,fetchImpl:async()=>{called=true;return Response.json({});}});
  const res=response();
  await handler(request([Buffer.alloc(8),Buffer.alloc(8)]),res);
  assert.equal(res.out.status,413);
  assert.equal(called,false);
});
