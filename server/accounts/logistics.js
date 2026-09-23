import {body,canonical,fail,hash,id,json,now,requireId,rows,text} from './common.js';
import {money,quantity,rupees} from './marketplace.js';
import {quantityBase} from './lots.js';
import {authenticateStaff} from './staff-auth.js';

const parse=value=>value?JSON.parse(value):null;
const stmt=(env,sql,...args)=>env.DB.prepare(sql).bind(...args);
const needed=(value,max,label)=>{const v=text(value,max,label);if(!v)fail('Enter '+label+'.');return v;};
const staffOnly=user=>{if(!user.staff||user.role!=='operations')fail('Only operations staff can make this change.',403);};
function date(value,label){const time=Date.parse(value);if(typeof value!=='string'||!Number.isFinite(time))fail('Enter a valid '+label+'.');return new Date(time).toISOString();}
async function order(env,user,orderId){
  requireId(orderId);const o=await stmt(env,`SELECT o.*,s.quantity_base,s.unit,s.mode,s.snapshot_json,s.lot_id,s.item_id,s.requirement_id FROM orders o JOIN supply_requests s ON s.id=o.request_id WHERE o.id=?`,orderId).first();
  if(!o||(!user.staff&&o.collector_id!==user.id&&o.recycler_id!==user.id))fail('Order not found.',404);return o;
}
async function job(env,o){return await stmt(env,'SELECT * FROM logistics_jobs WHERE order_id=?',o.id).first()||{order_id:o.id,version:o.version,state:'not_arranged',cost_version:0,cost_ack_version:0,returned_base:0,accepted_base:null};}
const afterPickup=j=>!!j.pickup_json;
async function projection(env,user,o){
  const j=await job(env,o),records=await rows(stmt(env,`SELECT r.*,coalesce(u.display_name,s.name,r.actor) AS actor_name FROM logistics_records r LEFT JOIN users u ON 'user:'||u.id=r.actor LEFT JOIN operations_staff s ON 'staff:'||s.id=r.actor WHERE r.order_id=? ${user.staff?'':"AND r.kind<>'internal-note'"} ORDER BY r.version DESC LIMIT 100`,o.id));
  const cases=await rows(stmt(env,'SELECT * FROM logistics_cases WHERE order_id=? ORDER BY created_at DESC LIMIT 100',o.id));
  return {order:{id:o.id,version:o.version,state:o.state,collectorId:o.collector_id,recyclerId:o.recycler_id,materialAmount:rupees(o.material_paise),paymentState:'Not recorded',locality:parse(o.snapshot_json).locality},
    logistics:{state:o.state==='cancelled'?'cancelled':j.state,unit:o.unit,mode:o.mode,requested:quantity(o.quantity_base,o.unit),schedule:parse(j.schedule_json),cost:parse(j.cost_json),costVersion:j.cost_version,costAcknowledged:j.cost_version>0&&j.cost_ack_version===j.cost_version,pickup:parse(j.pickup_json),receipt:parse(j.receipt_json),return:parse(j.return_json),acceptedQuantity:quantity(j.accepted_base,o.unit),returnedQuantity:quantity(j.returned_base,o.unit),canCancel:o.state==='accepted'&&!afterPickup(j)},
    records:records.map(r=>({id:r.id,version:r.version,actor:r.actor,actorName:r.actor_name,kind:r.kind,data:parse(r.data_json),createdAt:r.created_at})),cases};
}
async function begin(request,env,user){
  const input=await body(request);requireId(input.commandId);
  if(!Number.isSafeInteger(input.expectedVersion)||input.expectedVersion<0)fail('Refresh this record before making changes.');
  const digest=await hash(canonical({path:new URL(request.url).pathname,input,method:request.method}));
  const replay=async()=>{const r=await stmt(env,'SELECT * FROM logistics_commands WHERE actor=? AND command_id=?',user.actor,input.commandId).first();if(!r)return null;if(r.payload_hash!==digest)fail('This action differs from the saved retry.',409);return json({...parse(r.result_json),replayed:true});};
  return {input,digest,replay,previous:await replay(),user};
}
async function commit(env,c,first,result,extras=[]){
  const guard='EXISTS(SELECT 1 FROM logistics_commands WHERE actor=? AND command_id=?)',args=[c.user.actor,c.input.commandId];
  let writes;try{writes=await env.DB.batch([first,stmt(env,`INSERT INTO logistics_commands(actor,command_id,payload_hash,result_json,created_at) SELECT ?,?,?,?,? WHERE changes()=1`,...args,c.digest,JSON.stringify(result),now()),...extras.map(make=>make(guard,args))]);}
  catch(error){const replay=await c.replay();if(replay)return replay;if(/MARKET_CONFLICT:/.test(error.message))fail('The order or physical custody changed. Refresh before continuing.',409);throw error;}
  if(writes[0].meta.changes!==1){const replay=await c.replay();if(replay)return replay;fail('This record changed. Refresh and review your action.',409);}return json({...result,replayed:false});
}
async function evidence(env,user,input,unit){
  if(user.staff)fail('Handover evidence must be submitted by the collector or recycler.',403);
  const amount=input.quantity==='0'?0:quantityBase(input.quantity,unit);if(amount===null)fail('Enter the actual quantity.');
  const capturedAt=date(input.capturedAt,'capture time');if(Date.parse(capturedAt)>Date.now()+300000||Date.parse(capturedAt)<Date.now()-30*86400000)fail('Capture time must be within the past 30 days.');
  const location=needed(input.location,300,'location'),condition=needed(input.condition,500,'condition'),note=needed(input.message,2000,'handover note');
  // No GPS coordinates are inferred from an image or a manually entered place.
  if(input.locationSource!=='manual')fail('Choose the manual location source for this capture.');
  if(!Array.isArray(input.fileIds)||input.fileIds.length>5||new Set(input.fileIds).size!==input.fileIds.length)fail('Choose at most five evidence photos.');
  for(const f of input.fileIds){requireId(f);if(!await stmt(env,"SELECT id FROM files WHERE id=? AND owner_user_id=? AND state='ready'",f,user.id).first())fail('Upload your own evidence photos before submitting.',404);}
  const noPhotoReason=text(input.noPhotoReason,500,'missing photo reason');if(!input.fileIds.length&&!noPhotoReason)fail('Attach a handover photo or explain why no photo is available.');
  return {quantity:quantity(amount,unit),quantityBase:amount,unit,capturedAt,location,locationSource:'manual',condition,message:note,fileIds:input.fileIds,noPhotoReason,recordedAt:now(),supersedes:input.supersedes||null};
}
async function action(request,env,user,o,kind){
  if(user.staff)staffOnly(user);
  const c=await begin(request,env,user);if(c.previous)return c.previous;
  const input=c.input,j=await job(env,o),time=now(),version=o.version+1,recordId=id();
  if(o.version!==input.expectedVersion||(o.state!=='accepted'&&!['resolve-issue','internal-note'].includes(kind)))fail('Order changed or is cancelled. Refresh first.',409);
  const collector=!user.staff&&user.id===o.collector_id,recycler=!user.staff&&user.id===o.recycler_id;
  let data={},allocation=null,openCase=null,closeCase=null;
  switch(kind){
    case 'schedule':{
      staffOnly(user);if(afterPickup(j))fail('Pickup has already been recorded. Use exception or return handling.',409);
      const partner=await stmt(env,"SELECT * FROM logistics_partners WHERE id=? AND status='active'",requireId(input.partnerId)).first();
      if(!partner||!parse(partner.areas_json).includes(parse(o.snapshot_json).locality.trim().toLowerCase()))fail('Choose an available partner serving the collection area.',409);
      const start=date(input.start,'pickup start'),end=date(input.end,'pickup end');
      if(start>=end||Date.parse(end)<=Date.now()||Date.parse(end)-Date.parse(start)>86400000*2)fail('Choose a future pickup window of at most two days.');
      data={partnerId:partner.id,partnerName:partner.name,partnerContact:partner.contact,partnerVersion:partner.version,start,end,instructions:needed(input.instructions,2000,'pickup instructions'),reason:needed(input.message,1000,'schedule reason'),mode:o.mode};
      j.partner_id=partner.id;j.schedule_json=JSON.stringify(data);j.state='scheduled';break;
    }
    case 'cost':{
      staffOnly(user);const amount=money(input.amount);if(!['estimate','final'].includes(input.basis))fail('Choose estimate or final logistics charge.');
      data={amount:rupees(amount),amountPaise:amount,basis:input.basis,payer:'recycler',payee:needed(input.payee,200,'logistics payee'),source:needed(input.source,500,'charge source'),reason:needed(input.message,1000,'charge reason'),version:j.cost_version+1};
      j.cost_version++;j.cost_json=JSON.stringify(data);break;
    }
    case 'acknowledge-cost':
      if(!recycler)fail('Only the recycler can acknowledge logistics charges.',403);
      if(!j.cost_json||input.costVersion!==j.cost_version||j.cost_ack_version===j.cost_version)fail('Refresh the current logistics charge.',409);
      j.cost_ack_version=j.cost_version;data={costVersion:j.cost_version,amount:parse(j.cost_json).amount,payer:'recycler'};break;
    case 'schedule-change':
      if(user.staff)fail('Use the scheduling action to revise the window.',403);
      if(afterPickup(j))fail('Pickup is already recorded. Open an issue instead.',409);
      data={message:needed(input.message,2000,'requested schedule change')};openCase='Schedule change requested: '+data.message;break;
    case 'pickup':{
      if(!collector)fail('Only the collector can record handover.',403);
      if(j.state!=='scheduled'||afterPickup(j))fail('Operations must schedule the handover first.',409);
      if(!j.cost_version||j.cost_ack_version!==j.cost_version)fail('Recycler must acknowledge the current logistics charge before handover.',409);
      const partner=await stmt(env,"SELECT id FROM logistics_partners WHERE id=? AND status='active'",j.partner_id).first();if(!partner)fail('The assigned partner is unavailable. Request rescheduling.',409);
      data=await evidence(env,user,input,o.unit);if(data.supersedes)fail('Pickup evidence is immutable; open an issue for a correction.');
      if(data.quantityBase<=0||data.quantityBase>o.quantity_base)fail('Handover must be positive and within reserved quantity. Extra stock needs a separately reviewed request.',409);
      if(await stmt(env,"SELECT id FROM logistics_cases WHERE order_id=? AND state='open'",o.id).first())fail('Resolve open pickup issues before handover.',409);
      data.id=recordId;j.pickup_json=JSON.stringify(data);j.state='picked_up';allocation={supply:data.quantityBase,demand:o.quantity_base,state:'held'};break;
    }
    case 'in-transit':
      staffOnly(user);if(j.state!=='picked_up')fail('Record collector handover before transit.',409);j.state='in_transit';data={message:needed(input.message,1000,'partner update')};break;
    case 'receipt':{
      if(!recycler)fail('Only the receiving recycler can record inspection.',403);
      if(!['picked_up','in_transit','received'].includes(j.state)||j.accepted_base!==null)fail('Receipt is not editable at this stage.',409);
      data=await evidence(env,user,input,o.unit);
      const previous=parse(j.receipt_json);if((previous?.id||null)!==data.supersedes)fail('A correction must reference the current receipt.',409);
      data.id=recordId;j.receipt_json=JSON.stringify(data);j.state='received';
      if(data.quantityBase!==parse(j.pickup_json).quantityBase)openCase='Quantity variance: handed over '+parse(j.pickup_json).quantity+' '+o.unit+', receipt '+data.quantity+' '+o.unit+'. Review custody and evidence.';
      break;
    }
    case 'accept-receipt':{
      if(!collector)fail('Only the collector can accept the received quantity.',403);
      const receipt=parse(j.receipt_json),pickup=parse(j.pickup_json);
      if(!receipt||receipt.id!==input.receiptId||j.accepted_base!==null||j.state!=='received')fail('Refresh the current unacknowledged receipt.',409);
      if(receipt.quantityBase>pickup.quantityBase-j.returned_base)fail('Excess receipt needs a corrected inspection or separately reviewed stock and demand before acknowledgment.',409);
      j.accepted_base=receipt.quantityBase;allocation={supply:pickup.quantityBase-j.returned_base,demand:receipt.quantityBase,state:'consumed'};
      data={receiptId:receipt.id,acceptedQuantity:receipt.quantity,message:needed(input.message,1000,'quantity review note')};break;
    }
    case 'return-request':
      staffOnly(user);if(!afterPickup(j)||j.state==='returned')fail('There are no handed-over goods awaiting a return.',409);
      if(j.accepted_base!==null&&j.accepted_base>=parse(j.pickup_json).quantityBase-j.returned_base)fail('All goods have an accepted receipt. Open a dispute for a reviewed reversal; do not restore sold stock.',409);
      data={message:needed(input.message,2000,'return instructions')};j.state='return_pending';openCase='Return requested: '+data.message;break;
    case 'confirm-return':{
      if(!collector)fail('Only the collector can confirm physical return.',403);
      if(j.state!=='return_pending')fail('Operations must arrange the return first.',409);
      data=await evidence(env,user,input,o.unit);if(data.supersedes)fail('Return confirmations are immutable.');
      const pickup=parse(j.pickup_json),remaining=pickup.quantityBase-j.returned_base-(j.accepted_base||0);
      if(data.quantityBase<=0||data.quantityBase>remaining)fail('Return quantity exceeds goods eligible to return.',409);
      j.returned_base+=data.quantityBase;data.id=recordId;j.return_json=JSON.stringify(data);
      const supply=pickup.quantityBase-j.returned_base;
      if(supply===0){j.state='returned';j.accepted_base=0;}else if(j.accepted_base!==null&&supply===j.accepted_base)j.state='received';
      allocation={supply,demand:j.accepted_base??o.quantity_base,state:j.accepted_base===null?'held':'consumed'};break;
    }
    case 'issue':
      data={message:needed(input.message,2000,'issue details')};openCase=data.message;break;
    case 'resolve-issue':{
      staffOnly(user);const issue=await stmt(env,"SELECT * FROM logistics_cases WHERE id=? AND order_id=? AND state='open'",requireId(input.caseId),o.id).first();if(!issue)fail('Open issue not found.',404);
      if(afterPickup(j)&&(j.accepted_base===null||parse(j.pickup_json).quantityBase-j.returned_base!==(j.accepted_base||0)))fail('Document an accepted receipt and confirm missing goods returned before resolving the custody exception.',409);
      closeCase=issue.id;data={caseId:issue.id,resolution:needed(input.message,2000,'resolution and evidence reference')};break;
    }
    case 'internal-note':staffOnly(user);data={message:needed(input.message,2000,'restricted operations note')};break;
    default:fail('Unknown logistics action.',404);
  }
  const first=stmt(env,"UPDATE orders SET version=version+1,updated_at=? WHERE id=? AND version=? AND state=?",time,o.id,o.version,o.state);
  const extras=[(g,a)=>stmt(env,`INSERT INTO logistics_jobs(order_id,version,state,partner_id,schedule_json,cost_json,pickup_json,receipt_json,return_json,cost_version,cost_ack_version,accepted_base,returned_base,updated_at)
    SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,? WHERE ${g} ON CONFLICT(order_id) DO UPDATE SET version=excluded.version,state=excluded.state,partner_id=excluded.partner_id,schedule_json=excluded.schedule_json,cost_json=excluded.cost_json,pickup_json=excluded.pickup_json,receipt_json=excluded.receipt_json,return_json=excluded.return_json,cost_version=excluded.cost_version,cost_ack_version=excluded.cost_ack_version,accepted_base=excluded.accepted_base,returned_base=excluded.returned_base,updated_at=excluded.updated_at`,o.id,version,j.state,j.partner_id||null,j.schedule_json||null,j.cost_json||null,j.pickup_json||null,j.receipt_json||null,j.return_json||null,j.cost_version,j.cost_ack_version,j.accepted_base,j.returned_base,time,...a),
    (g,a)=>stmt(env,`INSERT INTO logistics_records(id,order_id,version,actor,kind,data_json,created_at) SELECT ?,?,?,?,?,?,? WHERE ${g}`,recordId,o.id,version,user.actor,kind,JSON.stringify(data),time,...a)];
  for(const f of data.fileIds||[])extras.push((g,a)=>stmt(env,`INSERT INTO logistics_files(record_id,file_id) SELECT ?,? WHERE ${g}`,recordId,f,...a));
  if(allocation)extras.push((g,a)=>stmt(env,`UPDATE reservations SET quantity_base=?,demand_base=?,state=? WHERE order_id=? AND ${g}`,Math.max(1,allocation.supply),allocation.demand,allocation.supply===0?'released':allocation.state,o.id,...a));
  if(openCase)extras.push((g,a)=>stmt(env,`INSERT INTO logistics_cases(id,order_id,opened_by,reason,state,created_at) SELECT ?,?,?,?,'open',? WHERE ${g}`,id(),o.id,user.actor,openCase,time,...a));
  if(closeCase)extras.push((g,a)=>stmt(env,`UPDATE logistics_cases SET state='resolved',resolution=?,resolved_at=? WHERE id=? AND ${g}`,data.resolution,time,closeCase,...a));
  return commit(env,c,first,{id:o.id,version,recordId},extras);
}
async function photo(env,user,o,fileId){
  requireId(fileId);const f=await stmt(env,`SELECT f.* FROM files f JOIN logistics_files lf ON lf.file_id=f.id JOIN logistics_records r ON r.id=lf.record_id WHERE r.order_id=? AND f.id=? AND f.state='ready' LIMIT 1`,o.id,fileId).first();
  if(!f)fail('Evidence not found.',404);const object=await env.ACCOUNT_BUCKET?.get(f.object_key);if(!object)fail('Evidence temporarily unavailable.',503);
  return new Response(object.body,{headers:{'Content-Type':f.mime_type,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
}
export async function logisticsRoute(request,env,user,path){
  const route=path.match(/^\/api\/v1\/orders\/([^/]+)\/logistics(?:\/([^/]+))?(?:\/([^/]+))?$/);if(!route)return null;
  user={...user,actor:'user:'+user.id};const o=await order(env,user,route[1]);
  if(route[2]==='photos'&&route[3]&&request.method==='GET')return photo(env,user,o,route[3]);
  if(route[3])fail('Not found.',404);
  if(!route[2]&&request.method==='GET')return json(await projection(env,user,o));
  if(route[2]&&request.method==='POST')return action(request,env,user,o,route[2]);fail('Method not supported.',405);
}
export async function operationsApi(request,env){
  const user=await authenticateStaff(request,env),path=new URL(request.url).pathname;
  if(path==='/api/ops/me'&&request.method==='GET')return json({staff:{id:user.id,name:user.name,role:user.role}});
  if(path==='/api/ops/partners'&&request.method==='GET')return json({partners:await rows(stmt(env,'SELECT * FROM logistics_partners ORDER BY name LIMIT 200'))});
  const partner=path.match(/^\/api\/ops\/partners\/([^/]+)$/);
  if(partner&&request.method==='PUT'){
    staffOnly(user);requireId(partner[1]);const c=await begin(request,env,user);if(c.previous)return c.previous;const i=c.input;
    if(!Array.isArray(i.areas)||i.areas.length<1||i.areas.length>20||!['active','unavailable'].includes(i.status))fail('Choose areas and availability.');
    const areas=[...new Set(i.areas.map(a=>needed(a,120,'service area').toLowerCase()))];
    const old=await stmt(env,'SELECT version FROM logistics_partners WHERE id=?',partner[1]).first();if((old?.version||0)!==i.expectedVersion)fail('Partner changed. Refresh first.',409);
    const snapshot={name:needed(i.name,120,'partner name'),contact:needed(i.contact,200,'partner contact'),areas,status:i.status};
    return commit(env,c,stmt(env,`INSERT INTO logistics_partners(id,name,contact,areas_json,status,version,updated_at) VALUES(?,?,?,?,?,1,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,contact=excluded.contact,areas_json=excluded.areas_json,status=excluded.status,version=logistics_partners.version+1,updated_at=excluded.updated_at WHERE logistics_partners.version=?`,partner[1],snapshot.name,snapshot.contact,JSON.stringify(areas),i.status,now(),i.expectedVersion),{id:partner[1],version:i.expectedVersion+1,partnerSnapshot:snapshot});
  }
  if(path==='/api/ops/orders'&&request.method==='GET'){
    const url=new URL(request.url),after=url.searchParams.get('after')||'';if(after)requireId(after);
    const page=await rows(stmt(env,`SELECT o.id,o.state,o.version,o.created_at,c.display_name AS collector,r.display_name AS recycler,json_extract(s.snapshot_json,'$.locality') AS locality,coalesce(j.state,'not_arranged') AS logistics_state,(SELECT count(*) FROM logistics_cases z WHERE z.order_id=o.id AND z.state='open') AS open_issues FROM orders o JOIN supply_requests s ON s.id=o.request_id JOIN users c ON c.id=o.collector_id JOIN users r ON r.id=o.recycler_id LEFT JOIN logistics_jobs j ON j.order_id=o.id WHERE o.id>? ORDER BY o.id LIMIT 51`,after));
    return json({orders:page.slice(0,50),nextCursor:page.length>50?page[49].id:null});
  }
  const route=path.match(/^\/api\/ops\/orders\/([^/]+)(?:\/([^/]+))?(?:\/([^/]+))?$/);
  if(route){const o=await order(env,user,route[1]);if(route[2]==='photos'&&route[3]&&request.method==='GET')return photo(env,user,o,route[3]);if(route[3])fail('Not found.',404);if(!route[2]&&request.method==='GET')return json(await projection(env,user,o));if(route[2]&&request.method==='POST')return action(request,env,user,o,route[2]);}
  fail('Not found.',404);
}
