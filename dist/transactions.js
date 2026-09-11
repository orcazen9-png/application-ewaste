import {newId, parseWeight, getPrice, saveLot, cancelLot} from './domain.js';

export const BUYERS = [
  {id:'buyer-green',name:'Green Loop Demo',areas:['Mumbai','Thane'],materials:['cables','pcb','motors'],factor:1.02,pickup:true},
  {id:'buyer-circle',name:'Circular Metals Demo',areas:['Mumbai','Navi Mumbai'],materials:['cables','motors'],factor:.98,pickup:true},
  {id:'buyer-board',name:'Board Recovery Demo',areas:['Mumbai','Thane','Navi Mumbai'],materials:['pcb','cables'],factor:1.04,pickup:true}
];
export const eligibleBuyers = lot => BUYERS.filter(b=>b.areas.includes(lot.locality)&&b.materials.includes(lot.materialId));
export function parseMoney(value){const text=String(value??'').trim();if(!/^\d+(\.\d{1,2})?$/.test(text))return null;const amount=Math.round(Number(text)*100);return Number.isSafeInteger(amount)&&amount>0&&amount<=100000000?amount:null;}
const requireThat=(test,message)=>{if(!test)throw new Error(message);};
export function transact(state,command,now=new Date().toISOString()){
  const {type,lotId,input={}}=command;
  if(type==='reset_samples'){
    const ids=new Set(state.lots.filter(l=>l.isSample).map(l=>l.id));
    state.lots=state.lots.filter(l=>!ids.has(l.id));for(const key of ['offers','pickups','handovers','payments','events'])state[key]=state[key].filter(r=>!ids.has(r.lotId));return {removed:ids.size};
  }
  if(type==='sample'){
    requireThat(!state.lots.some(l=>l.isSample),'Reset the existing sample before generating another.');
    const start=new Date(new Date(now).getTime()-7*86400000).toISOString();
    const sample=saveLot(state,{materialId:'cables',locality:'Mumbai',weight:'10',photoId:input.photoId,description:'SAMPLE · fictional completed sale'},{publish:true,now:start});sample.isSample=true;
    const run=(action,data={},time=start)=>transact(state,{type:action,lotId:sample.id,input:data},time);
    const offer=run('offer',{buyerId:'buyer-green'});run('accept',{offerId:offer.id});
    run('schedule',{slot:new Date(new Date(start).getTime()+86400000).toISOString(),instructions:'Demo collection point'});run('advance');run('advance');run('handover',{weight:'9.5',photoId:input.photoId,location:'Demo collection point'});run('confirm');run('payment',{amount:'500'});return sample;
  }
  const lot=state.lots.find(l=>l.id===lotId);
  if(type==='list'){
    const existed=state.lots.some(l=>l.id===input.id),saved=saveLot(state,input,{publish:true,now});
    if(!existed&&input.priorEstimate){
      const p=input.priorEstimate,keys=['ratePaise','lowPaise','highPaise','lowTotalPaise','highTotalPaise','grams'];
      requireThat(keys.every(k=>Number.isSafeInteger(p[k])&&p[k]>0)&&p.lowPaise<=p.highPaise&&Number.isFinite(new Date(p.priceAt).getTime()),'The saved valuation is invalid.');
      saved.originalEstimate=Object.fromEntries([...keys,'priceId','priceAt','simulated'].map(k=>[k,p[k]]));
      saved.valuationHistory.unshift({...saved.originalEstimate,source:'device-import',capturedAt:now});
    }
    if(!existed&&input.priorCreatedAt&&Number.isFinite(new Date(input.priorCreatedAt).getTime()))saved.createdAt=new Date(input.priorCreatedAt).toISOString();
    if(!existed&&Array.isArray(input.priorEvents)){
      requireThat(input.priorEvents.length<=100,'This lot has too many historical events for automatic import.');
      const events=input.priorEvents.filter(e=>e.lotId===saved.id&&['created','updated','listed'].includes(e.type)&&/^event-[a-f0-9-]{36}$/.test(e.id||'')&&Number.isFinite(new Date(e.at).getTime())).map(e=>({id:e.id,lotId:saved.id,type:e.type,at:new Date(e.at).toISOString(),actor:state.collector.id,simulated:false}));
      if(events.length){state.events.at(-1).type='synced';state.events.push(...events);}
    }
    return saved;
  }
  requireThat(lot,'Lot not found.');
  if(command.expectedVersion!==undefined)requireThat(command.expectedVersion===lot.version,'This transaction changed. Refresh and review it before trying again.');
  const offer=state.offers.find(o=>o.id===lot.acceptedOfferId);
  const pickup=state.pickups.find(p=>p.lotId===lotId);
  const handover=state.handovers.find(h=>h.lotId===lotId&&!['superseded'].includes(h.status));
  let result;
  if(type==='cancel')return cancelLot(state,lotId,now);
  if(type==='offer'){
    requireThat(lot.status==='listed','Offers are only available for listed lots.');
    const buyer=eligibleBuyers(lot).find(b=>b.id===input.buyerId);requireThat(buyer,'This buyer does not serve this material and locality.');
    const rate=input.rate===undefined?Math.round(getPrice(state,lot.materialId,lot.locality).ratePaise*buyer.factor):parseMoney(input.rate);
    requireThat(rate,'Enter a positive rate with up to two decimal places.');
    for(const old of state.offers.filter(o=>o.lotId===lotId&&o.buyerId===buyer.id&&o.status==='pending'))old.status='withdrawn';
    result={id:newId('offer'),lotId,buyerId:buyer.id,lotVersion:lot.version,ratePaise:rate,status:'pending',createdAt:now,simulated:true,note:String(input.note||'Demo pickup included. Final value uses confirmed weight.').slice(0,300)};state.offers.push(result);
  }else if(type==='accept'){
    requireThat(lot.status==='listed'&&!offer,'An offer has already been accepted or this lot is unavailable.');
    result=state.offers.find(o=>o.id===input.offerId&&o.lotId===lotId&&o.status==='pending');
    requireThat(result&&result.lotVersion===lot.version,'This offer is no longer valid. Request a new offer.');
    result.status='accepted';result.acceptedAt=now;lot.acceptedOfferId=result.id;lot.status='accepted';
    for(const other of state.offers.filter(o=>o.lotId===lotId&&o.id!==result.id&&o.status==='pending'))other.status='rejected';
  }else if(type==='schedule'){
    requireThat(offer&&['accepted','pickup'].includes(lot.status)&&(!pickup||pickup.status==='scheduled'),'Pickup cannot be scheduled at this stage.');
    const when=new Date(input.slot);requireThat(Number.isFinite(when.getTime())&&when>new Date(now)&&when.getTime()-new Date(now).getTime()<31*86400000,'Choose a pickup time within the next 30 days.');
    requireThat(String(input.instructions||'').trim(),'Enter pickup instructions or an address.');
    if(pickup){pickup.history.push({slot:pickup.slot,instructions:pickup.instructions,changedAt:now});pickup.slot=when.toISOString();pickup.instructions=String(input.instructions).slice(0,500);result=pickup;}
    else{result={id:newId('pickup'),lotId,buyerId:offer.buyerId,slot:when.toISOString(),instructions:String(input.instructions).slice(0,500),status:'scheduled',history:[],createdAt:now,simulated:true};state.pickups.push(result);}
    lot.status='pickup';
  }else if(type==='advance'){
    requireThat(pickup&&['scheduled','on_way'].includes(pickup.status),'There is no pickup to advance.');
    pickup.status=pickup.status==='scheduled'?'on_way':'arrived';result=pickup;
  }else if(type==='handover'){
    requireThat(pickup?.status==='arrived'&&offer&&(!handover||handover.status==='disputed'),'Wait for arrival, or resolve the current handover first.');
    const grams=parseWeight(input.weight);requireThat(grams,'Enter a valid confirmed weight.');
    requireThat(input.photoId,'Add a handover photo.');requireThat(String(input.location||'').trim(),'Enter the handover location.');
    if(handover)handover.status='superseded';
    result={id:newId('handover'),lotId,offerId:offer.id,buyerId:offer.buyerId,grams,ratePaise:offer.ratePaise,finalValuePaise:Math.round(grams*offer.ratePaise/1000),photoId:input.photoId,location:String(input.location).slice(0,300),locationSource:'manual',submittedAt:now,status:'pending',simulated:true};
    state.handovers.push(result);lot.status='awaiting_confirmation';
  }else if(type==='dispute'){
    requireThat(handover?.status==='pending','Only a pending handover can be disputed.');requireThat(String(input.reason||'').trim(),'Explain the correction needed.');
    handover.status='disputed';handover.reason=String(input.reason).slice(0,300);lot.status='pickup';result=handover;
  }else if(type==='confirm'){
    requireThat(handover?.status==='pending','There is no handover awaiting confirmation.');
    handover.status='confirmed';handover.confirmedAt=now;pickup.status='completed';lot.status='payment_due';result=handover;
  }else if(type==='payment'){
    requireThat(handover?.status==='confirmed','Confirm the handover before recording a payment.');
    const amount=parseMoney(input.amount),paid=state.payments.filter(p=>p.handoverId===handover.id&&p.status==='confirmed').reduce((n,p)=>n+p.amountPaise,0);
    requireThat(amount&&amount<=handover.finalValuePaise-paid,'Enter a positive amount no greater than the outstanding balance.');
    result={id:newId('payment'),lotId,handoverId:handover.id,amountPaise:amount,status:'confirmed',method:'simulated',confirmedAt:now,simulated:true};state.payments.push(result);
    lot.status=paid+amount===handover.finalValuePaise?'completed':'payment_due';
  }else throw new Error('Unknown transaction action.');
  // Offers bind to commercial lot revisions; submitting an offer must not invalidate competing quotes.
  if(type!=='offer'){lot.version++;lot.updatedAt=now;}
  state.events.push({id:newId('event'),lotId,type,recordId:result.id,at:now,actor:['offer','advance','confirm','dispute','payment'].includes(type)?'demo-buyer':state.collector.id,simulated:true});
  return result;
}
