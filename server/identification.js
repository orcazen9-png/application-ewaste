import {assessPhoto} from './gemini.js';
import {choices,CATALOG} from '../dist/waste-catalog.js';
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
const idOK=value=>/^[a-z]+-[a-f0-9-]{36}$/.test(value||'');
const money=value=>Number.isSafeInteger(value)&&value>0&&value<=1000000000;
const pending=new Map();
async function update(env,spaceId,fn){
  for(let i=0;i<5;i++){
    const current=await env.DB.prepare('SELECT * FROM spaces WHERE id=?').bind(spaceId).first();
    const state=JSON.parse(current.state_json);state.identificationItems??=[];
    const result=fn(state.identificationItems);
    const write=await env.DB.prepare('UPDATE spaces SET state_json=?,version=version+1 WHERE id=? AND version=?').bind(JSON.stringify(state),spaceId,current.version).run();
    if(write.meta.changes)return result;
  }fail('Another update is in progress. Refresh and retry.',409);
}
export async function identification(request,env,space){
  const path=new URL(request.url).pathname;
  if(path==='/api/identification'&&request.method==='GET')return {configured:!!(env.GEMINI_API_KEY&&env.GEMINI_MODEL),items:JSON.parse(space.state_json).identificationItems||[]};
  if(request.method!=='POST')fail('Not found.',404);
  const raw=await request.text();if(raw.length>10000)fail('Request too large.',413);
  let input;try{input=JSON.parse(raw);}catch{fail('Invalid request.');}
  if(path==='/api/identification/items'){
    if(!idOK(input.id)||!idOK(input.photoId)||!money(input.askingPricePaise)||!['item','kg','lot'].includes(input.priceBasis)||!Number.isFinite(input.quantity)||input.quantity<=0||input.quantity>100000)fail('Enter a photo, positive quantity and asking price.');
    if(!await env.BUCKET.head(`${space.id}/${input.photoId}`))fail('Upload the photo first.');
    return update(env,space.id,items=>{
      const existing=items.find(i=>i.id===input.id);if(existing)return existing;
      if(items.length>=100)fail('This demo workspace supports up to 100 equipment submissions.');
      const item={id:input.id,photoId:input.photoId,quantity:input.quantity,askingPricePaise:input.askingPricePaise,priceBasis:input.priceBasis,currency:'INR',description:String(input.description||'').slice(0,500),createdAt:new Date().toISOString(),assessments:[],decisions:[],offers:[],taxonomyVersion:CATALOG.version};items.push(item);return item;
    });
  }
  const item=(JSON.parse(space.state_json).identificationItems||[]).find(i=>i.id===input.id);
  if(!item)fail('Submission not found.',404);
  if(path==='/api/identification/assess'){
    if(!['broad','detailed'].includes(input.scope))fail('Invalid assessment scope.');
    const cached=item.assessments.find(a=>a.scope===input.scope&&a.model===env.GEMINI_MODEL&&a.taxonomyVersion===CATALOG.version);if(cached)return cached;
    const key=`${space.id}/${item.id}/${input.scope}`;
    if(pending.has(key))fail('Assessment in progress. Refresh shortly.',409);
    pending.set(key,true);
    try{
      const object=await env.BUCKET.get(`${space.id}/${item.photoId}`);if(!object)fail('Photo unavailable.',404);
      const bytes=object.body instanceof Uint8Array?object.body:new Uint8Array(await new Response(object.body).arrayBuffer());
      const result=await assessPhoto(bytes,object.httpMetadata?.contentType,input.scope,env,undefined,object.base64);
      result.id='assessment-'+crypto.randomUUID();result.photoId=item.photoId;
      return await update(env,space.id,items=>{const current=items.find(i=>i.id===item.id);const old=current.assessments.find(a=>a.scope===result.scope&&a.model===result.model&&a.taxonomyVersion===result.taxonomyVersion);if(old)return old;current.assessments.push(result);return result;});
    }finally{pending.delete(key);}
  }
  if(path==='/api/identification/confirm'){
    // A lot photo can hold several equipment types, so a decision confirms a list of codes.
    // A person can also decide the photo is not e-waste, or that a better photo is needed; both carry no codes.
    const outcome=input.outcome??'categories';
    if(!['categories','not_ewaste','retake_photo'].includes(outcome))fail('Choose a supported decision.');
    const codes=[...new Set(Array.isArray(input.codes)?input.codes:input.code?[input.code]:[])];
    const allowed=new Set(choices(input.scope).map(c=>c.code));
    if(!['broad','detailed'].includes(input.scope)||codes.length>12||codes.some(c=>!allowed.has(c)))fail('Choose supported categories.');
    if(outcome==='categories'&&!codes.length)fail('Tick at least one category, or mark the photo as not e-waste or needing a better photo.');
    if(outcome!=='categories'&&codes.length)fail('A not-e-waste or retake decision cannot include categories.');
    return update(env,space.id,items=>{const current=items.find(i=>i.id===item.id);const assessment=current.assessments.find(a=>a.id===input.assessmentId&&a.scope===input.scope);if(!assessment)fail('Run the assessment before confirming.');
      const suggested=(assessment.items||[]).map(i=>i.code);
      const agrees=outcome==='categories'?suggested.length===codes.length&&suggested.every(c=>codes.includes(c))
        :outcome==='not_ewaste'?assessment.status==='out_of_scope':['needs_review','parts_only'].includes(assessment.status);
      const decision={id:'decision-'+crypto.randomUUID(),scope:input.scope,outcome,codes,suggestedCodes:suggested,suggestedStatus:assessment.status,assessmentId:assessment.id,method:agrees?'confirmed':'corrected',actorRole:input.scope==='broad'?'aggregator':'recycler',at:new Date().toISOString()};current.decisions.push(decision);return decision;});
  }
  if(path==='/api/identification/offer'){
    if(!money(input.amountPaise))fail('Enter a positive offer price.');
    return update(env,space.id,items=>{const current=items.find(i=>i.id===item.id);const offer={id:'offer-'+crypto.randomUUID(),amountPaise:input.amountPaise,currency:'INR',priceBasis:current.priceBasis,status:'offered',at:new Date().toISOString()};current.offers.push(offer);return offer;});
  }
  fail('Not found.',404);
}
