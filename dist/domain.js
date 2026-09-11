export const MATERIALS = [
  {id:'cables', name:'Copper cables', subcategory:'Mixed insulated cables', base:24500, icon:'cables'},
  {id:'pcb', name:'Circuit boards', subcategory:'Mixed PCBs', base:38000, icon:'pcb'},
  {id:'motors', name:'Electric motors', subcategory:'Mixed small motors', base:9200, icon:'motors'}
];
export const LOCALITIES = ['Mumbai','Thane','Navi Mumbai'];
export const newId = (prefix) => `${prefix}-${crypto.randomUUID()}`;
export const shortId = id => id ? `LOT-${id.split('-')[1].slice(0,6).toUpperCase()}` : '';
export const dayKey = date => new Date(date).toISOString().slice(0,10);
export function random(seed) { let x=seed|0; x^=x<<13; x^=x>>>17; x^=x<<5; return {seed:x>>>0,value:(x>>>0)/4294967296}; }
export function createState(now = new Date().toISOString()) {
  let seed=891231, prices=[];
  for (const [li,locality] of LOCALITIES.entries()) for (const material of MATERIALS) {
    let rate=Math.round(material.base*(1+li*.018)*.96);
    for (let days=29;days>=0;days--) {
      const r=random(seed);seed=r.seed;rate=Math.round(rate*(1+(r.value-.47)*.03));
      const date=new Date(now);date.setUTCDate(date.getUTCDate()-days);
      prices.push({id:`price-${material.id}-${li}-${days}`,materialId:material.id,locality,ratePaise:rate,lowPaise:Math.round(rate*.9),highPaise:Math.round(rate*1.1),at:date.toISOString(),simulated:true});
    }
  }
  return {schemaVersion:1,revision:0,seed,collector:{id:'collector-demo',language:'en',locality:'Mumbai'},prices,lots:[],offers:[],pickups:[],handovers:[],payments:[],events:[],lastPriceUpdate:now};
}
export function getPrice(state, materialId, locality) {return state.prices.filter(p=>p.materialId===materialId&&p.locality===locality).at(-1);}
export function getHistory(state,materialId,locality) {
  const days=new Map(); for(const p of state.prices.filter(p=>p.materialId===materialId&&p.locality===locality))days.set(dayKey(p.at),p);
  return [...days.values()].slice(-30);
}
export function getMovement(state,materialId,locality) {
  const p=getPrice(state,materialId,locality);if(!p)return 0;
  const prev=state.prices.filter(x=>x.materialId===materialId&&x.locality===locality&&dayKey(x.at)<dayKey(p.at)).at(-1);
  return prev?((p.ratePaise-prev.ratePaise)/prev.ratePaise)*100:0;
}
export function evolvePrices(state, now=new Date().toISOString()) {
  if(new Date(now)<=new Date(state.lastPriceUpdate))return state;
  for(const locality of LOCALITIES)for(const material of MATERIALS){
    const prev=getPrice(state,material.id,locality);const r=random(state.seed);state.seed=r.seed;
    const rate=Math.round(Math.max(material.base*.6,Math.min(material.base*1.4,prev.ratePaise*(1+(r.value-.5)*.03))));
    state.prices.push({id:newId('price'),materialId:material.id,locality,ratePaise:rate,lowPaise:Math.round(rate*.9),highPaise:Math.round(rate*1.1),at:now,simulated:true});
  }
  // Preserve each day's closing observation plus the current intraday observations.
  const cutoff=new Date(now);cutoff.setUTCDate(cutoff.getUTCDate()-30);
  const daily=new Map(),today=[];
  for(const p of state.prices){if(p.at<cutoff.toISOString())continue;if(dayKey(p.at)===dayKey(now))today.push(p);else daily.set(`${p.materialId}|${p.locality}|${dayKey(p.at)}`,p);}
  state.prices=[...daily.values(),...today.slice(-1080)];state.lastPriceUpdate=now;return state;
}
export function parseWeight(value) {
  const text=String(value??'').trim();
  if(!/^\d+(\.\d{1,3})?$/.test(text))return null;
  const grams=Math.round(Number(text)*1000);return grams>0&&grams<=50000000?grams:null;
}
export function valuation(state,materialId,locality,weight) {
  const grams=parseWeight(weight),p=getPrice(state,materialId,locality);if(!grams||!p)return null;
  return {priceId:p.id,ratePaise:p.ratePaise,lowPaise:p.lowPaise,highPaise:p.highPaise,lowTotalPaise:Math.round(p.lowPaise*grams/1000),highTotalPaise:Math.round(p.highPaise*grams/1000),grams,priceAt:p.at,simulated:true};
}
export function saveLot(state,input,{publish=false,now=new Date().toISOString()}={}) {
  const existing=state.lots.find(l=>l.id===input.id);
  if(existing && !['draft','listed'].includes(existing.status))throw new Error('This lot can no longer be edited.');
  if(existing && input.expectedVersion!==undefined && input.expectedVersion!==existing.version)throw new Error('This lot changed in another tab. Reopen it before editing.');
  if(input.materialId&&!MATERIALS.some(m=>m.id===input.materialId))throw new Error('Choose a supported material.');
  if(!LOCALITIES.includes(input.locality))throw new Error('Choose a supported locality.');
  if(publish){if(!input.materialId)throw new Error('Choose a material.');if(!parseWeight(input.weight))throw new Error('Enter a positive weight, up to 50,000 kg, with at most 3 decimal places.');if(!input.photoId)throw new Error('Add a material photo before listing.');}
  const commercialChange=existing&&(existing.materialId!==input.materialId||existing.weight!==input.weight||existing.locality!==input.locality);
  const estimate=existing&&!commercialChange?existing.estimate:valuation(state,input.materialId,input.locality,input.weight);
  const lot={...existing,id:input.id||newId('lot'),collectorId:state.collector.id,materialId:input.materialId||'',locality:input.locality,weight:String(input.weight??''),estimatedGrams:parseWeight(input.weight),description:String(input.description||'').slice(0,500),condition:input.condition||'unsorted',photoId:input.photoId||null,estimate,originalEstimate:existing?.originalEstimate||(publish?estimate:null),valuationHistory:[...(existing?.valuationHistory||[]),...(estimate&&(!existing||commercialChange)?[{...estimate,capturedAt:now}]:[])],status:publish?'listed':existing?.status||'draft',storage:'device',createdAt:existing?.createdAt||now,updatedAt:now,version:(existing?.version||0)+1,isSample:false};
  if(commercialChange)for(const offer of state.offers.filter(o=>o.lotId===lot.id&&o.status==='pending'))offer.status='invalidated';
  state.lots=state.lots.filter(l=>l.id!==lot.id);state.lots.unshift(lot);
  state.events.push({id:newId('event'),lotId:lot.id,type:publish&&existing?.status!=='listed'?'listed':existing?'updated':'created',at:now,actor:state.collector.id,simulated:false});
  return lot;
}
export function cancelLot(state,id,now=new Date().toISOString()) {
  const lot=state.lots.find(l=>l.id===id);if(!lot)throw new Error('Lot not found.');if(lot.status==='cancelled')return lot;
  if(!['draft','listed'].includes(lot.status))throw new Error('This lot cannot be cancelled.');lot.status='cancelled';lot.version++;lot.updatedAt=now;
  state.events.push({id:newId('event'),lotId:id,type:'cancelled',at:now,actor:state.collector.id,simulated:false});return lot;
}
export function ledger(state) {
  const sales=state.handovers.filter(h=>h.confirmedAt);
  const payments=state.payments.filter(p=>p.status==='confirmed'&&sales.some(h=>h.id===p.handoverId));
  const value=sales.reduce((sum,h)=>sum+h.finalValuePaise,0),received=payments.reduce((sum,p)=>sum+p.amountPaise,0);
  return {valuePaise:value,receivedPaise:received,outstandingPaise:value-received,sales};
}
