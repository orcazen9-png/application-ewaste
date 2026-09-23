import {createState,evolvePrices} from '../dist/domain.js';
import {transact} from '../dist/transactions.js';
import {identification} from './identification.js';
import {d1Bucket} from './d1-photos.js';
import {lotAssessment} from './lot-assessments.js';
import {collectorProjection,marketCommand} from './collector-market.js';
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
const digest=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),b=>b.toString(16).padStart(2,'0')).join('');
const keyPattern=/^[a-f0-9]{48}$/;
const idPattern=/^[a-z]+-[a-f0-9-]{36}$/;
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
async function body(request){const raw=await request.text();if(raw.length>50000)fail('Request is too large.',413);try{return JSON.parse(raw);}catch{fail('Invalid request.');}}
export async function api(request,env){
  const url=new URL(request.url),path=url.pathname;
  if(path==='/api/health')return json({ok:true});
  if(path==='/api/spaces'&&request.method==='POST'){
    // Public hosts (no Sites sign-in in front) share one pre-created workspace through its join link instead.
    if(env.SPACE_CREATION==='disabled')fail('New workspaces are turned off here. Open the demo join link or scan its QR code.',403);
    // Sites supplies this header after sign-in; it is never supplied by client JavaScript.
    if(!env.LOCAL_DEMO&&!request.headers.get('oai-authenticated-user-id'))fail('Open the website and sign in to create a demo workspace.',401);
    const code=Array.from(crypto.getRandomValues(new Uint8Array(24)),b=>b.toString(16).padStart(2,'0')).join('');
    const id=crypto.randomUUID(),state=createState();
    await env.DB.prepare('INSERT INTO spaces (id,access_hash,state_json,version,created_at) VALUES (?,?,?,0,?)').bind(id,await digest(code),JSON.stringify(state),new Date().toISOString()).run();
    return json({code,state,version:0},201);
  }
  const code=request.headers.get('Authorization')?.replace(/^Bearer /,'')||'';
  if(!keyPattern.test(code))fail('Enter a valid workspace pairing code.',401);
  const space=await env.DB.prepare('SELECT * FROM spaces WHERE access_hash=?').bind(await digest(code)).first();
  if(!space)fail('Workspace code was not recognized.',401);
  if(path==='/api/lot-assessments')return json(await lotAssessment(request,env,space));
  if(path.startsWith('/api/identification'))return json(await identification(request,env,space));
  if(path==='/api/state'&&request.method==='GET')return json({state:collectorProjection(JSON.parse(space.state_json)),version:space.version});
  const photoMatch=path.match(/^\/api\/photos\/([^/]+)$/);
  if(photoMatch){
    const id=photoMatch[1];if(!idPattern.test(id))fail('Invalid photo reference.');const objectKey=`${space.id}/${id}`;
    if(request.method==='GET'){const object=await env.BUCKET.get(objectKey);if(!object)fail('Photo not found.',404);return new Response(object.body,{headers:{'Content-Type':object.httpMetadata?.contentType||'image/jpeg','Cache-Control':'private, max-age=86400','X-Content-Type-Options':'nosniff'}});}
    if(request.method==='PUT'){
      const bytes=new Uint8Array(await request.arrayBuffer());if(bytes.length>2*1024*1024)fail('Photo must be below 2 MB.',413);
      const type=bytes[0]===255&&bytes[1]===216?'image/jpeg':bytes[0]===137&&bytes[1]===80&&bytes[2]===78&&bytes[3]===71?'image/png':String.fromCharCode(...bytes.slice(0,4))==='RIFF'&&String.fromCharCode(...bytes.slice(8,12))==='WEBP'?'image/webp':null;
      if(!type)fail('Choose a valid JPG, PNG, or WebP photo.');
      if(!await env.BUCKET.head(objectKey))await env.BUCKET.put(objectKey,bytes,{httpMetadata:{contentType:type}});
      return json({id});
    }
  }
  if(path==='/api/commands'&&request.method==='POST'){
    const payload=await body(request),{operationId,command}=payload;
    if(!idPattern.test(operationId||'')||!command||typeof command.type!=='string')fail('Invalid transaction request.');
    const hash=await digest(JSON.stringify(command));
    for(let attempt=0;attempt<4;attempt++){
      const receipt=await env.DB.prepare('SELECT * FROM operation_receipts WHERE space_id=? AND operation_id=?').bind(space.id,operationId).first();
      if(receipt){if(receipt.payload_hash!==hash)fail('This retry does not match the original action.',409);return json({result:JSON.parse(receipt.result_json),replayed:true});}
      const current=await env.DB.prepare('SELECT * FROM spaces WHERE id=?').bind(space.id).first();
      const state=JSON.parse(current.state_json);
      if(['list','market_order'].includes(command.type)&&command.input?.wasteAssessment){
        const assessment=state.lotAssessments?.find(a=>a.id===command.input.wasteAssessment.id&&a.photoId===command.input.photoId);
        if(!assessment)fail('Run the photo assessment in this workspace before saving it.',400);
        // Category corrections are allowed; provider evidence always comes from the saved assessment.
        command.input.wasteAssessment=assessment;
      }
      const existing=state.lots.find(l=>l.id===(command.type==='list'?command.input?.id:command.lotId));
      if(existing&&(command.type==='list'?command.input?.expectedVersion:command.expectedVersion)===undefined)fail('Refresh the transaction before changing it.',409);
      if(['list','handover','sample'].includes(command.type)||(command.type==='market_order'&&command.input?.photoId)){
        const photo=command.input?.photoId;if(!idPattern.test(photo||'')||!await env.BUCKET.head(`${space.id}/${photo}`))fail('Upload the photo before submitting this record.');
      }
      let result;
      try{result=command.type.startsWith('market_')?marketCommand(state,command):command.type==='prices'?(evolvePrices(state),{updated:true}):transact(state,command);}catch(error){fail(error.message,409);}
      for(const lot of state.lots)lot.storage='synced';
      state.revision=current.version+1;
      // Both writes commit together. The conditional insert cannot record a losing CAS operation.
      const writes=await env.DB.batch([
        env.DB.prepare('UPDATE spaces SET state_json=?,version=version+1,last_operation=? WHERE id=? AND version=?').bind(JSON.stringify(state),operationId,space.id,current.version),
        env.DB.prepare('INSERT INTO operation_receipts (space_id,operation_id,payload_hash,result_json) SELECT ?,?,?,? FROM spaces WHERE id=? AND version=? AND last_operation=?').bind(space.id,operationId,hash,JSON.stringify(result),space.id,current.version+1,operationId)
      ]);
      if(writes[0].meta.changes===1)return json({result,replayed:false});
    }
    fail('Another device is updating this workspace. Please refresh and try again.',409);
  }
  fail('Not found.',404);
}
export default {async fetch(request,env){
  if(!env.BUCKET&&env.DB)env={...env,BUCKET:d1Bucket(env.DB)};
  const url=new URL(request.url),origin=request.headers.get('Origin');
  const allowed=origin===url.origin||['https://localhost','capacitor://localhost','http://localhost'].includes(origin)||(env.LOCAL_DEMO&&/^http:\/\/127\.0\.0\.1:\d+$/.test(origin||''));
  const cors=allowed?{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'Authorization, Content-Type','Access-Control-Allow-Methods':'GET, POST, PUT, OPTIONS','Vary':'Origin'}:{};
  if(request.method==='OPTIONS')return new Response(null,{status:allowed?204:403,headers:cors});
  let response;
  try{response=url.pathname.startsWith('/api/')?await api(request,env):await env.APP_ASSETS(request);}catch(error){response=json({error:error.status?error.message:'The server could not complete this request.'},error.status||500);if(!error.status)console.error(error.message);}
  const headers=new Headers(response.headers);for(const [key,value]of Object.entries(cors))headers.set(key,value);
  return new Response(response.body,{status:response.status,headers});
}};
