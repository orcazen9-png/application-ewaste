import {normalizeLotClassification} from '../dist/lot-classification.js';

const requireThat=(ok,message)=>{if(!ok)throw new Error(message);};
const id=prefix=>`${prefix}-${crypto.randomUUID()}`;
const clean=(value,max=120)=>String(value??'').trim().slice(0,max);
const areas=['Mumbai','Thane','Navi Mumbai'];
const epoch='2026-09-23T00:00:00.000Z';
const expires='2026-10-23T23:59:59.000Z';
export function marketState(state){
  if(state.collectorMarket)return state.collectorMarket;
  const recyclers=[
    {id:'demo-green',name:'Green Loop Demo',serviceAreas:['Mumbai','Thane'],verification:'demo_unverified'},
    {id:'demo-board',name:'Board Recovery Demo',serviceAreas:areas,verification:'demo_unverified'},
    {id:'demo-renew',name:'Renew Devices Demo',serviceAreas:areas,verification:'demo_unverified'}
  ];
  const rows=[
    ['pcb','demo-board','Circuit boards',['B01','B03','B04','B08','B19'],'kg',18500,1,100,'pickup'],
    ['wire','demo-green','Insulated copper wire',['B04','B05','B07','B19'],'kg',24500,1,100,'pickup'],
    ['phones','demo-renew','Smartphones',['B02'],'piece',50000,1,20,'drop_off'],
    ['laptops','demo-renew','Laptop computers',['B01'],'piece',150000,1,10,'pickup'],
    ['motors','demo-green','Electric motors',['B10','B11','B12','B16'],'kg',9200,1,100,'pickup'],
    ['mixed','demo-board','Mixed electronics',[],'kg',4000,1,200,'drop_off'],
    ['tablets','demo-renew','Tablets',['B02'],'piece',75000,1,20,'drop_off']
  ];
  return {version:1,demo:true,profile:{name:'Collector',locality:'Mumbai',language:'en'},recyclers,
    requirements:rows.map(([key,recyclerId,material,codes,unit,quotedPricePaise,minQuantity,maxQuantity,pickupMode])=>({id:'requirement-'+key,recyclerId,material,codes,unit,quotedPricePaise,minQuantity,maxQuantity,pickupMode,serviceAreas:recyclers.find(r=>r.id===recyclerId).serviceAreas,status:'active',version:1,createdAt:epoch,expiresAt:expires,demo:true})),
    orders:[],contacts:[],notifications:[],events:[],reports:[]};
}
export function collectorProjection(state){return {...state,collectorMarket:marketState(state)};}
function notify(m,title,target,targetId,now){m.notifications.unshift({id:id('notice'),title,target,targetId,createdAt:now,read:false});m.notifications=m.notifications.slice(0,200);}
function event(m,type,recordId,now){m.events.push({id:id('event'),type,recordId,at:now,demo:true});m.events=m.events.slice(-1000);}
function active(m,requirementId,now){const r=m.requirements.find(x=>x.id===requirementId);requireThat(r,'Requirement not found.');requireThat(r.status==='active'&&Date.parse(r.expiresAt)>Date.parse(now),'This requirement has expired or closed. Choose another.');return r;}
function contact(m,r,now){let c=m.contacts.find(x=>x.requirementId===r.id);if(!c){requireThat(m.contacts.length<500,'Contact limit reached.');c={id:id('contact'),requirementId:r.id,recyclerId:r.recyclerId,status:'contacted',createdAt:now};m.contacts.push(c);}c.lastInteractionAt=now;return c;}
function quantity(value,unit){const s=String(value??'').trim();requireThat((unit==='piece'?/^\d+$/:/^\d+(\.\d{1,3})?$/).test(s),'Enter a valid quantity; pieces must be whole numbers.');const q=Number(s);requireThat(q>0&&q<=50000&&Number.isFinite(q),'Quantity must be between 0 and 50,000.');return q;}

// These prototype actions are deliberately workspace-scoped, not individual user authentication.
export function marketCommand(state,command,now=new Date().toISOString()){
  const m=state.collectorMarket=structuredClone(marketState(state)),input=command.input||{};
  requireThat(m.demo===true,'Demo actions are unavailable for live marketplace records.');
  let result;
  if(command.type==='market_profile'){
    const name=clean(input.name,60),locality=clean(input.locality);
    requireThat(name.length>=2,'Enter your name.');requireThat(areas.includes(locality),'Choose a supported locality.');
    m.profile={...m.profile,name,locality,language:'en',updatedAt:now};result=m.profile;
  }else if(command.type==='market_contact'){
    const r=active(m,input.requirementId,now);result=contact(m,r,now);if(result.status==='closed')result.status='contacted';
    notify(m,'Demo contact saved. No message was sent.','requirement',r.id,now);
  }else if(command.type==='market_contact_status'){
    result=m.contacts.find(c=>c.id===input.contactId);requireThat(result,'Contact not found.');
    requireThat(['responded','negotiating','closed'].includes(input.status),'Invalid contact status.');
    if(input.status!=='closed')active(m,result.requirementId,now);
    requireThat(result.status!=='order_created'||input.status==='closed','Use the order to track this interaction.');
    result.status=input.status;result.lastInteractionAt=now;
  }else if(command.type==='market_order'){
    const r=active(m,input.requirementId,now);
    requireThat(input.quoteVersion===r.version,'The quote changed. Refresh and review it.');
    requireThat(input.unit===r.unit,'Quantity unit does not match the quote.');
    requireThat(r.serviceAreas.includes(input.locality),'Recycler does not serve this locality.');
    const q=quantity(input.quantity,r.unit);requireThat(q>=r.minQuantity&&q<=r.maxQuantity,'Quantity is outside this requirement’s range.');
    requireThat(input.materialConfirmed===true,'Confirm the requested material before ordering.');
    requireThat(m.orders.length<500,'Order limit reached.');
    let classification={wasteAssessment:null,wasteDecision:null};
    if(input.photoId){classification=normalizeLotClassification(input,now);requireThat(classification.wasteDecision?.outcome==='categories','Confirm categories for the current photo first.');}
    const total=Math.round(r.quotedPricePaise*Math.round(q*1000)/1000);requireThat(Number.isSafeInteger(total)&&total>0,'Invalid quote total.');
    result={id:id('order'),collectorId:state.collector.id,requirementId:r.id,recyclerId:r.recyclerId,recyclerName:m.recyclers.find(x=>x.id===r.recyclerId).name,
      material:r.material,quantity:q,unit:r.unit,unitPricePaise:r.quotedPricePaise,estimatedTotalPaise:total,quoteVersion:r.version,locality:input.locality,pickupMode:r.pickupMode,
      photoId:input.photoId||null,...classification,status:'requested',version:1,createdAt:now,updatedAt:now,demo:true,timeline:[{status:'requested',at:now,note:'Demo request created; quote awaits acceptance.'}]};
    m.orders.unshift(result);const c=contact(m,r,now);c.status='order_created';c.orderId=result.id;
    notify(m,'Demo order requested: '+r.material,'order',result.id,now);
  }else if(command.type==='market_order_status'){
    const order=m.orders.find(o=>o.id===input.orderId);requireThat(order,'Order not found.');
    requireThat(order.version===input.expectedVersion,'This order changed. Refresh it before continuing.');
    const next={requested:'accepted',accepted:'pickup',pickup:'received',received:'completed'};
    const cancel=input.status==='cancelled';
    requireThat(cancel?!['completed','cancelled'].includes(order.status):next[order.status]===input.status,'This order cannot move to that status.');
    let note=clean(input.note,300);
    if(cancel){requireThat(note.length>=3,'Enter a cancellation reason.');order.cancellationReason=note;}
    if(input.status==='accepted'){active(m,order.requirementId,now);order.agreedUnitPricePaise=order.unitPricePaise;note='Demo recycler acceptance simulated.';}
    if(input.status==='received'){
      const q=quantity(input.confirmedQuantity,order.unit);requireThat(q<=order.quantity,'Confirmed quantity cannot exceed the agreed quantity.');
      order.confirmedQuantity=q;order.finalTotalPaise=Math.round(order.agreedUnitPricePaise*Math.round(q*1000)/1000);note='Demo receipt; final quantity confirmed.';
    }
    if(input.status==='completed'){requireThat(Number.isSafeInteger(order.finalTotalPaise),'Confirm received quantity first.');order.paidPaise=order.finalTotalPaise;note='Demo payment recorded. No money transferred.';}
    order.status=input.status;order.updatedAt=now;order.version++;order.timeline.push({status:order.status,at:now,note});result=order;
    notify(m,'Demo order '+order.status+': '+order.material,'order',order.id,now);
  }else if(command.type==='market_notification_read'){
    result=m.notifications.find(n=>n.id===input.notificationId);requireThat(result,'Notification not found.');result.read=true;
  }else if(command.type==='market_report'){
    const r=m.requirements.find(r=>r.id===input.requirementId);requireThat(r,'Requirement not found.');const reason=clean(input.reason,500);requireThat(reason.length>=5,'Describe the issue.');requireThat(m.reports.length<100,'Report limit reached.');
    result={id:id('report'),requirementId:r.id,reason,createdAt:now,status:'recorded',demo:true};m.reports.push(result);
  }else throw new Error('Unknown collector action.');
  event(m,command.type,result.id||'profile',now);return result;
}
