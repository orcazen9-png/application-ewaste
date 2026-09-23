import {hash,fail,now,rows} from './common.js';
import {toBase64,fromBase64} from '../base64.js';

// D1 has a 2 MB row limit. Small immutable chunks keep the demo below that
// limit; all metadata/chunks commit atomically. Only authorized routes call get.
export function privateD1Bucket(DB){
  return {
    async head(key){return DB.prepare('SELECT key,size FROM private_objects WHERE key=?').bind(key).first();},
    async put(key,data,options){
      const bytes=data instanceof Uint8Array?data:new Uint8Array(data);
      if(!bytes.length||bytes.length>5242880)fail('Choose a file up to 5 MB.',413);
      const digest=await hash(bytes),old=await DB.prepare('SELECT sha256 FROM private_objects WHERE key=?').bind(key).first();
      if(old){if(old.sha256!==digest)fail('This file reference cannot be overwritten.',409);return;}
      const writes=[DB.prepare(`INSERT INTO private_objects(key,size,sha256,content_type,created_at)
        SELECT ?,?,?,?,? WHERE (SELECT coalesce(sum(size),0) FROM private_objects)+?<=209715200 ON CONFLICT(key) DO NOTHING`)
        .bind(key,bytes.length,digest,options?.httpMetadata?.contentType||'application/octet-stream',now(),bytes.length)];
      for(let offset=0,part=0;offset<bytes.length;offset+=262144,part++)writes.push(DB.prepare(`INSERT INTO private_chunks(key,part,data)
        SELECT ?,?,? WHERE EXISTS(SELECT 1 FROM private_objects WHERE key=? AND sha256=?) ON CONFLICT(key,part) DO NOTHING`)
        .bind(key,part,toBase64(bytes.subarray(offset,offset+262144)),key,digest));
      await DB.batch(writes);
      const saved=await DB.prepare('SELECT sha256 FROM private_objects WHERE key=?').bind(key).first();
      if(!saved)fail('Demo storage is full. Contact Freedom Value support.',413);
      if(saved.sha256!==digest)fail('This file reference cannot be overwritten.',409);
    },
    async get(key){
      const meta=await DB.prepare('SELECT * FROM private_objects WHERE key=?').bind(key).first();if(!meta)return null;
      const chunks=await rows(DB.prepare('SELECT part,data FROM private_chunks WHERE key=? ORDER BY part').bind(key));
      const bytes=new Uint8Array(meta.size);let offset=0;
      for(let i=0;i<chunks.length;i++){const data=fromBase64(chunks[i].data);if(chunks[i].part!==i||offset+data.length>bytes.length)fail('File is temporarily unavailable.',503);bytes.set(data,offset);offset+=data.length;}
      if(offset!==meta.size||await hash(bytes)!==meta.sha256)fail('File is temporarily unavailable.',503);
      return {body:bytes,httpMetadata:{contentType:meta.content_type}};
    }
  };
}
