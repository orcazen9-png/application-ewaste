import {readState,changeState,getPhoto} from './store.js';
import {newId,createState} from './domain.js';
import {transact} from './transactions.js';
export const HOSTED_ENDPOINT='https://ewaste-collector-marketplace-9png.animesh0909.chatgpt.site';
let active;
async function request(config,path,options={}){
  const response=await fetch(config.endpoint+path,{...options,signal:AbortSignal.timeout(15000),headers:{Authorization:`Bearer ${config.code}`,...options.headers}});
  if(!response.headers.get('content-type')?.includes('application/json')&&path!='/api/photos/')throw new Error('Sign in on the website. This private server may not allow an APK connection yet.');
  const data=await response.json();if(!response.ok)throw Object.assign(new Error(data.error||'Unable to sync.'),{status:response.status});return data;
}
export async function connectWorkspace(endpoint,code,create=false){
  const url=new URL(endpoint||location.origin);if(url.protocol!=='https:'&&!['localhost','127.0.0.1'].includes(url.hostname))throw new Error('Use an HTTPS server address.');
  if(url.username||url.password||url.search||url.hash||url.pathname!=='/')throw new Error('Use only the server origin, without a path.');
  const current=await readState()??createState();if(current.sync?.code)throw new Error('This device is already connected. Use a separate browser profile for a different workspace.');
  if(current.lots.some(l=>!['draft','listed','cancelled'].includes(l.status)))throw new Error('This device has local transactions. Keep them here and use a fresh browser profile to join a shared workspace.');
  let config={endpoint:url.origin,code:code.trim()};
  const data=create?await request(config,'/api/spaces',{method:'POST'}):await request(config,'/api/state');
  if(create)config.code=data.code;
  await changeState(s=>{s.sync=config;s.outbox=s.lots.filter(l=>l.status==='listed').map(l=>({operationId:newId('operation'),command:{type:'list',input:lotInput(l,s)},lotId:l.id}));for(const l of s.lots.filter(l=>l.status==='listed'))l.storage='waiting';});
  await synchronize();return config;
}
export const lotInput=(lot,state)=>({...Object.fromEntries(['id','materialId','locality','weight','description','condition','photoId','equipmentCode','equipmentDecision'].map(k=>[k,lot[k]])),priorEstimate:lot.originalEstimate||undefined,priorCreatedAt:lot.createdAt,priorEvents:state?.events.filter(e=>e.lotId===lot.id)});
export function queueListing(state,lot,previous){
  if(!state.sync?.code)return;
  const input=lotInput(lot,state);if(previous?.storage==='synced')input.expectedVersion=previous.version;
  if((state.outbox||[]).some(o=>o.lotId===lot.id))throw new Error('Sync the pending change to this lot before editing it again.');
  state.outbox||=[];state.outbox.push({operationId:newId('operation'),command:{type:'list',input},lotId:lot.id});lot.storage='waiting';
}
export async function execute(command){
  const state=await readState();
  if(!navigator.onLine)throw new Error('Reconnect before changing this transaction.');
  if(!state.sync?.code||command.type==='cancel'&&state.lots.find(l=>l.id===command.lotId)?.status==='draft')return changeState(s=>transact(s,command));
  if(state.outbox?.length)throw new Error('Sync pending changes before starting another transaction.');
  await changeState(s=>{s.outbox=[{operationId:newId('operation'),command,lotId:command.lotId}];});
  await synchronize();return {state:await readState()};
}
export async function synchronize(){
  if(active)return active;
  active=(async()=>{
    let local=await readState();if(!local.sync?.code)return;
    const config=local.sync;
    try{
      for(const item of local.outbox||[]){
        const photoId=item.command.input?.photoId;
        if(photoId){const blob=await getPhoto(photoId);if(!blob)throw new Error('The photo is missing on this device.');await request(config,'/api/photos/'+photoId,{method:'PUT',body:blob});}
        try{await request(config,'/api/commands',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(item)});}
        catch(error){if(error.status===409||error.status===400){await changeState(s=>{s.outbox=s.outbox.filter(o=>o.operationId!==item.operationId);const lot=s.lots.find(l=>l.id===item.lotId);if(lot?.storage==='waiting'){const oldId=lot.id;lot.id=newId('lot');lot.sourceLotId=oldId;lot.storage='device';lot.status='draft';lot.version=1;s.events.push({id:newId('event'),lotId:lot.id,type:'created',at:new Date().toISOString(),actor:s.collector.id,simulated:false});}s.sync.error=error.message;});await pull(config); }throw error;}
        await changeState(s=>{s.outbox=s.outbox.filter(o=>o.operationId!==item.operationId);const lot=s.lots.find(l=>l.id===item.lotId);if(lot)lot.storage='synced';});
      }
      await pull(config);await changeState(s=>{s.sync.lastSync=new Date().toISOString();s.sync.error=null;});
    }catch(error){await changeState(s=>{s.sync.error=error.message;});throw error;}
  })();try{return await active;}finally{active=null;}
}
async function pull(config){
  const remote=await request(config,'/api/state');
  await changeState(s=>{const pending=new Set((s.outbox||[]).map(o=>o.lotId));const device=s.lots.filter(l=>l.storage!=='synced'||pending.has(l.id));
    s.lots=[...device,...remote.state.lots.filter(l=>!device.some(d=>d.id===l.id))];
    const privateIds=new Set(device.map(l=>l.id));s.events=[...s.events.filter(e=>privateIds.has(e.lotId)),...remote.state.events.filter(e=>!privateIds.has(e.lotId))];
    for(const key of ['offers','pickups','handovers','payments','prices','seed','lastPriceUpdate'])s[key]=remote.state[key];
  });
}
export async function loadSharedPhoto(id){
  const cached=await getPhoto(id);if(cached)return cached;const local=await readState();if(!local.sync?.code)return null;
  const response=await fetch(local.sync.endpoint+'/api/photos/'+id,{headers:{Authorization:`Bearer ${local.sync.code}`},signal:AbortSignal.timeout(15000)});
  if(!response.ok||!response.headers.get('content-type')?.startsWith('image/'))return null;const blob=await response.blob();await changeState(()=>{},{photo:{id,blob}});return blob;
}
