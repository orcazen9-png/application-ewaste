import {assessPhoto} from './gemini.js';
import {CATALOG} from '../dist/waste-catalog.js';
const pending=new Map();
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});};

export async function lotAssessment(request,env,space){
  if(request.method!=='POST')fail('Not found.',404);
  const raw=await request.text();if(raw.length>1000)fail('Request too large.',413);
  let input;try{input=JSON.parse(raw);}catch{fail('Invalid request.');}
  const photoId=input?.photoId;
  if(!/^photo-[a-f0-9-]{36}$/.test(photoId||''))fail('Choose a lot photo first.');
  const matches=a=>a.photoId===photoId&&a.model===env.GEMINI_MODEL&&a.taxonomyVersion===CATALOG.version;
  const saved=(JSON.parse(space.state_json).lotAssessments||[]).find(matches);
  if(saved)return saved;
  const key=`${space.id}/${photoId}/${env.GEMINI_MODEL}`;
  if(pending.has(key))return pending.get(key);
  const run=(async()=>{
    const object=await env.BUCKET.get(`${space.id}/${photoId}`);if(!object)fail('Upload the lot photo first.',404);
    const bytes=object.body instanceof Uint8Array?object.body:new Uint8Array(await new Response(object.body).arrayBuffer());
    const result={...await assessPhoto(bytes,object.httpMetadata?.contentType,'broad',{...env,GEMINI_HEDGE_MS:'0'},undefined,object.base64),id:'assessment-'+crypto.randomUUID(),photoId};
    for(let attempt=0;attempt<5;attempt++){
      const current=await env.DB.prepare('SELECT * FROM spaces WHERE id=?').bind(space.id).first();
      const state=JSON.parse(current.state_json);state.lotAssessments??=[];
      const existing=state.lotAssessments.find(matches);if(existing)return existing;
      if(state.lotAssessments.length>=500)fail('This demo workspace has reached its photo assessment limit.');
      state.lotAssessments.push(result);
      const write=await env.DB.prepare('UPDATE spaces SET state_json=?,version=version+1 WHERE id=? AND version=?').bind(JSON.stringify(state),space.id,current.version).run();
      if(write.meta.changes)return result;
    }
    fail('Another device is updating the workspace. Retry the assessment.',409);
  })();
  pending.set(key,run);
  try{return await run;}finally{pending.delete(key);}
}
