// Photo store with the same get/head/put shape as the R2 BUCKET binding, kept in the D1 `photos` table.
// Used when a deployment has no R2 bucket. D1 caps a value at 2,000,000 bytes, and base64 adds a third.
import {toBase64,fromBase64} from './base64.js';
const LIMIT=1400000;
const fail=(message,status)=>{throw Object.assign(new Error(message),{status});};
export function d1Bucket(DB){
  return {
    async head(key){return await DB.prepare('SELECT key FROM photos WHERE key=?').bind(key).first();},
    async get(key){
      const row=await DB.prepare('SELECT content_type,data_base64 FROM photos WHERE key=?').bind(key).first();if(!row)return null;
      return {body:fromBase64(row.data_base64),httpMetadata:{contentType:row.content_type}};
    },
    async put(key,bytes,options){
      if(bytes.length>LIMIT)fail('Photo must be below 1.4 MB.',413);
      await DB.prepare('INSERT OR IGNORE INTO photos (key,content_type,data_base64) VALUES (?,?,?)').bind(key,options?.httpMetadata?.contentType||'image/jpeg',toBase64(bytes)).run();
    }
  };
}
