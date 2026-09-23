import {choices} from './waste-catalog.js';

export const BROAD_CATEGORIES=choices('broad');
const allowed=new Set(BROAD_CATEGORIES.map(c=>c.code));
const statuses=new Set(['identified','mixed_lot','needs_review','parts_only','out_of_scope']);
export const categoryName=code=>BROAD_CATEGORIES.find(c=>c.code===code)?.name||code;
const codes=value=>{
  if(!Array.isArray(value)||value.length>12||value.some(c=>!allowed.has(c)))throw new Error('Choose up to 12 supported waste categories.');
  return [...new Set(value)];
};

// Persist a photo-bound assessment and a separate human decision. Neither sets prices.
export function normalizeLotClassification(input,now=new Date().toISOString()){
  let wasteAssessment=null,wasteDecision=null;
  const a=input.wasteAssessment,d=input.wasteDecision;
  if(a){
    if(!input.photoId||a.photoId!==input.photoId||a.scope!=='broad'||!statuses.has(a.status)||!/^assessment-[a-f0-9-]{36}$/.test(a.id||''))throw new Error('The assessment does not belong to this lot photo.');
    if(!Array.isArray(a.items)||a.items.length>12)throw new Error('Invalid photo assessment.');
    codes(a.items.map(i=>i.code));
    wasteAssessment={id:a.id,photoId:a.photoId,scope:'broad',status:a.status,provider:'gemini',model:String(a.model||'').slice(0,100),taxonomyVersion:String(a.taxonomyVersion||'').slice(0,100),
      items:a.items.map(i=>({code:i.code,evidence:String(i.evidence||'').slice(0,1200),approximateCount:Number.isSafeInteger(i.approximateCount)&&i.approximateCount>0?i.approximateCount:null})),
      description:String(a.description||'').slice(0,1200),uncertainty:String(a.uncertainty||'').slice(0,1200),nextPhoto:String(a.nextPhoto||'').slice(0,1200),createdAt:a.createdAt};
  }
  if(d){
    if(!input.photoId||d.photoId!==input.photoId||!['categories','not_ewaste','retake_photo'].includes(d.outcome))throw new Error('Confirm the categories for the current photo.');
    const selected=codes(d.codes),suggested=wasteAssessment?.items.map(i=>i.code)||[];
    if((d.outcome==='categories')!==(selected.length>0))throw new Error('Select categories, or mark the photo as not e-waste or needing a retake.');
    const agrees=d.outcome==='categories'?selected.length===suggested.length&&selected.every(c=>suggested.includes(c))
      :d.outcome==='not_ewaste'?a?.status==='out_of_scope':['needs_review','parts_only'].includes(a?.status);
    wasteDecision={photoId:input.photoId,outcome:d.outcome,codes:selected,method:wasteAssessment?(agrees?'confirmed':'corrected'):'manual',assessmentId:wasteAssessment?.id||null,
      confirmedAt:Number.isFinite(Date.parse(d.confirmedAt))?new Date(d.confirmedAt).toISOString():now};
  }
  return {wasteAssessment,wasteDecision};
}

export async function assessLotPhoto(blob,photoId,config,{fetcher=fetch,timeoutMs=90000}={}){
  if(!config?.code)throw new Error('Connect your workspace below to identify the photo.');
  const headers={Authorization:`Bearer ${config.code}`};
  const upload=await fetcher(config.endpoint+'/api/photos/'+encodeURIComponent(photoId),{method:'PUT',headers:{...headers,'Content-Type':blob.type},body:blob,signal:AbortSignal.timeout(20000)});
  if(!upload.ok){const error=await upload.json().catch(()=>({}));throw new Error(error.error||'Photo upload failed. Please retry.');}
  const response=await fetcher(config.endpoint+'/api/lot-assessments',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({photoId}),signal:AbortSignal.timeout(timeoutMs)});
  const result=await response.json();
  if(!response.ok)throw new Error(result.error||'Photo identification failed. Please retry.');
  return normalizeLotClassification({photoId,wasteAssessment:result}).wasteAssessment;
}
