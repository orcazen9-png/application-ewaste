import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {localBindings} from '../scripts/local-backend.mjs';
import {d1Bucket} from '../server/d1-photos.js';
test('D1 photo store round-trips bytes, keeps the first upload and rejects values D1 cannot hold',async()=>{
  const env=await localBindings(await mkdtemp(path.join(tmpdir(),'ewaste-d1-photos-')));const bucket=d1Bucket(env.DB);
  try{
    const bytes=new Uint8Array(300000).map((_,i)=>(i*31)%256);
    assert.equal(await bucket.head('space/photo-a'),null);
    await bucket.put('space/photo-a',bytes,{httpMetadata:{contentType:'image/png'}});
    await bucket.put('space/photo-a',new Uint8Array([1,2,3]),{httpMetadata:{contentType:'image/jpeg'}});
    const object=await bucket.get('space/photo-a');
    assert.ok(await bucket.head('space/photo-a'));assert.equal(object.httpMetadata.contentType,'image/png');assert.deepEqual(object.body,bytes);assert.equal(object.base64,Buffer.from(bytes).toString('base64'));
    await assert.rejects(bucket.put('space/big',new Uint8Array(1400001),{}),{status:413});
    assert.equal(await bucket.get('space/missing'),null);
  }finally{env.close();}
});
