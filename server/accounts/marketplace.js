import {paymentColumns,paymentState} from './finance-read.js';
import {CATALOG} from '../../dist/waste-catalog.js';
import {body,canonical,fail,hash,id,json,now,requireId,requireRole,rows,text} from './common.js';
import {quantityBase} from './lots.js';

const activeStates=['submitted','clarification'];
const allocated="state IN ('held','consumed')";
export function money(value,optional=false) {
  if(optional&&(value===null||value===undefined||value===''))return null;
  if(typeof value!=='string'||!/^\d{1,8}(\.\d{1,2})?$/.test(value))fail('Enter rupees with at most two decimal places.');
  const [whole,fraction='']=value.split('.');return Number(whole)*100+Number(fraction.padEnd(2,'0'));
}
export const quantity=(n,unit)=>n===null?null:unit==='kg'?`${Math.floor(n/1000)}.${String(n%1000).padStart(3,'0')}`:String(n);
export const rupees=n=>n===null?null:`${Math.floor(n/100)}.${String(n%100).padStart(2,'0')}`;
export function materialAmount(ratePaise,amount,unit){const divisor=unit==='kg'?1000n:1n;return Number((BigInt(ratePaise)*BigInt(amount)+divisor/2n)/divisor);}
function conflict(error) {
  const found=error.message?.match(/MARKET_CONFLICT: ([^\n]+)/);
  if(found)fail(found[1].replace(/: SQLITE_CONSTRAINT.*$/,''),409);
  throw error;
}
function version(input){if(!Number.isSafeInteger(input.expectedVersion)||input.expectedVersion<0)fail('Refresh before making this change.');return input.expectedVersion;}
async function command(request,env,user){
  const input=await body(request);requireId(input.commandId);
  const digest=await hash(canonical({path:new URL(request.url).pathname,method:request.method,input}));
  const replay=async()=>{
    const saved=await env.DB.prepare('SELECT * FROM command_receipts WHERE actor_id=? AND command_id=?').bind(user.id,input.commandId).first();
    if(!saved)return null;if(saved.payload_hash!==digest)fail('This retry differs from the saved action.',409);
    return json({...JSON.parse(saved.result_json),replayed:true});
  };
  return {input,digest,replay,previous:await replay(),user};
}
async function commit(env,c,first,result,extras=[]) {
  const guard='EXISTS(SELECT 1 FROM command_receipts WHERE actor_id=? AND command_id=?)',args=[c.user.id,c.input.commandId],time=now();
  const writes=[first,env.DB.prepare(`INSERT INTO command_receipts(actor_id,command_id,payload_hash,result_json,created_at) SELECT ?,?,?,?,? WHERE changes()=1`)
    .bind(...args,c.digest,JSON.stringify(result),time),...extras.map(make=>make(guard,args)),
    env.DB.prepare(`INSERT INTO audit_events(id,actor_id,action,resource_id,resource_version,created_at) SELECT ?,?,'market.changed',?,?,? WHERE ${guard}`).bind(id(),c.user.id,result.id,result.version||1,time,...args)];
  let answer;try{answer=await env.DB.batch(writes);}catch(error){const replay=await c.replay();if(replay)return replay;conflict(error);}
  if(answer[0].meta.changes!==1){const replay=await c.replay();if(replay)return replay;fail('This record changed. Refresh and review before retrying.',409);}
  return json({...result,replayed:false});
}
const event=(env,requestId,actor,kind,message)=>(guard,args)=>env.DB.prepare(`INSERT INTO market_events(id,request_id,actor_id,kind,message,created_at) SELECT ?,?,?,?,?,? WHERE ${guard}`).bind(id(),requestId,actor,kind,message,now(),...args);
const demoGrant="EXISTS(SELECT 1 FROM demo_facility_access d WHERE d.facility_id=f.id AND d.expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now'))";
const demoAccess=(env,r)=>env.DEMO_MODE==='true'&&!!r.demo_eligible;
const reviewJoin=' LEFT JOIN facility_profiles fp ON fp.facility_id=f.id';
const reviewed="f.verification_status='verified' AND (fp.facility_id IS NULL OR (fp.status='approved' AND fp.valid_until>strftime('%Y-%m-%dT%H:%M:%fZ','now') AND EXISTS(SELECT 1 FROM json_each(fp.profile_json,'$.categories') WHERE value=r.broad_code)))";
const eligible=(env,r,code=r.broad_code)=>demoAccess(env,r)||(r.verification_status==='verified'&&(!r.review_status||(r.review_status==='approved'&&r.review_until>now()&&JSON.parse(r.review_profile).categories.includes(code))));
async function facility(env,user){
  const row=await env.DB.prepare(`SELECT f.*,fp.status AS review_status,fp.valid_until AS review_until,fp.profile_json AS review_profile,${demoGrant} AS demo_eligible FROM facilities f JOIN organizations o ON o.id=f.organization_id${reviewJoin} WHERE o.owner_user_id=?`).bind(user.id).first();
  if(!row)fail('Complete recycler onboarding first.',409);return row;
}
function cursor(request){const value=new URL(request.url).searchParams.get('after')||'';if(value)requireId(value);return value;}
const requirementSelect=`SELECT r.*,u.display_name AS recycler_name,f.name AS facility_name,f.verification_status,fp.status AS review_status,fp.valid_until AS review_until,fp.profile_json AS review_profile,${demoGrant} AS demo_eligible,
  coalesce((SELECT sum(coalesce(demand_base,quantity_base)) FROM reservations z WHERE z.requirement_id=r.id AND ${allocated}),0) AS allocated_base
  FROM requirements r JOIN users u ON u.id=r.owner_id JOIN facilities f ON f.id=r.facility_id${reviewJoin}`;
function projectRequirement(r,env){return {id:r.id,facilityId:r.facility_id,recyclerName:r.recycler_name||r.facility_name||'Recycler',verificationStatus:r.review_status?(r.review_status==='approved'?(r.review_until>now()?'verified':'expired'):r.review_status):r.verification_status,reviewSource:r.review_status?'Freedom Value document review':'Existing facility record',demoAccess:demoAccess(env,r),
  broadCode:r.broad_code,detailedCode:r.detailed_code,title:r.title,specification:r.specification,unit:r.unit,rate:rupees(r.rate_paise),ratePaise:r.rate_paise,
  minimum:quantity(r.minimum_base,r.unit),target:quantity(r.target_base,r.unit),remaining:quantity(r.target_base===null?null:Math.max(0,r.target_base-r.allocated_base),r.unit),
  areas:JSON.parse(r.areas_json),modes:JSON.parse(r.modes_json),validUntil:r.valid_until,state:r.state,version:r.version,updatedAt:r.updated_at};}
async function getRequirement(env,record){return env.DB.prepare(requirementSelect+' WHERE r.id=?').bind(requireId(record)).first();}
function normalizeRequirement(input){
  const broadCode=input.broadCode,detailedCode=input.detailedCode||null;
  if(!CATALOG.broad_categories.some(c=>c.id===broadCode))fail('Choose a valid broad category.');
  if(detailedCode&&!CATALOG.categories.some(c=>c.code===detailedCode))fail('Choose a valid detailed category.');
  if(detailedCode&&CATALOG.categories.find(c=>c.code===detailedCode).broad_category_id!==broadCode)fail('Choose a detailed code within the selected broad group.');
  const title=text(input.title,120,'title'),specification=text(input.specification,2000,'specification');
  const unit=input.unit,minimum=quantityBase(input.minimum,unit),target=quantityBase(input.target,unit),rate=money(input.rate);
  if(!title||!minimum||rate<=0||(target!==null&&target<minimum))fail('Enter a title, positive rate and valid demand quantities.');
  if(!Array.isArray(input.areas)||!input.areas.length||input.areas.length>20)fail('Enter one to twenty service areas.');
  const areas=[...new Set(input.areas.map(a=>text(a,120,'area').toLowerCase()))];if(areas.some(a=>!a))fail('Service areas cannot be empty.');
  if(!Array.isArray(input.modes)||!input.modes.length||input.modes.length>2||input.modes.some(m=>!['pickup','dropoff'].includes(m)))fail('Choose pickup and/or drop-off.');
  const modes=[...new Set(input.modes)],until=Date.parse(input.validUntil);
  if(!Number.isFinite(until)||until<=Date.now()||until>Date.now()+366*86400000)fail('Choose validity within the next year.');
  if(!['active','paused'].includes(input.state))fail('Choose active or paused.');
  return {broadCode,detailedCode,title,specification,unit,minimum,target,rate,areas,modes,validUntil:new Date(until).toISOString(),state:input.state};
}
async function requirementsRoute(request,env,user,record){
  requireRole(user,'recycler');
  if(request.method==='GET'){
    if(record){const row=await getRequirement(env,record);if(!row||row.owner_id!==user.id)fail('Requirement not found.',404);return json({requirement:projectRequirement(row,env)});}
    const page=await rows(env.DB.prepare(requirementSelect+' WHERE r.owner_id=? AND r.id>? ORDER BY r.id LIMIT 51').bind(user.id,cursor(request)));
    return json({requirements:page.slice(0,50).map(r=>projectRequirement(r,env)),nextCursor:page.length>50?page[49].id:null,demoAccess:demoAccess(env,await facility(env,user))});
  }
  if(request.method!=='PUT'||!record)fail('Method not supported.',405);requireId(record);
  const c=await command(request,env,user);if(c.previous)return c.previous;
  const v=version(c.input),n=normalizeRequirement(c.input),f=await facility(env,user),existing=await getRequirement(env,record);
  if(existing&&existing.owner_id!==user.id)fail('Requirement not found.',404);
  if(n.state==='active'&&!eligible(env,f,n.broadCode))fail('Facility verification is required before publishing. You can save a paused requirement.',403);
  if((existing?.version||0)!==v)fail('Requirement changed. Refresh before saving.',409);
  const time=now(),reason=text(c.input.reason,1000,'change reason');if(v&&!reason)fail('Explain this requirement change.');
  const statement=env.DB.prepare(`INSERT INTO requirements(id,owner_id,facility_id,broad_code,detailed_code,title,specification,unit,rate_paise,minimum_base,target_base,areas_json,modes_json,valid_until,state,version,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,?,?) ON CONFLICT(id) DO UPDATE SET broad_code=excluded.broad_code,detailed_code=excluded.detailed_code,title=excluded.title,specification=excluded.specification,unit=excluded.unit,rate_paise=excluded.rate_paise,minimum_base=excluded.minimum_base,target_base=excluded.target_base,areas_json=excluded.areas_json,modes_json=excluded.modes_json,valid_until=excluded.valid_until,state=excluded.state,version=requirements.version+1,updated_at=excluded.updated_at WHERE requirements.owner_id=? AND requirements.version=?`)
    .bind(record,user.id,f.id,n.broadCode,n.detailedCode,n.title,n.specification,n.unit,n.rate,n.minimum,n.target,JSON.stringify(n.areas),JSON.stringify(n.modes),n.validUntil,n.state,time,time,user.id,v);
  return commit(env,c,statement,{id:record,version:v+1},[(guard,args)=>env.DB.prepare(`INSERT INTO requirement_revisions(requirement_id,version,actor_id,snapshot_json,reason,created_at) SELECT ?,?,?,?,?,? WHERE ${guard}`).bind(record,v+1,user.id,JSON.stringify(n),reason||'Initial requirement',time,...args)]);
}
async function source(env,user,lotId,itemId){
  const lot=await env.DB.prepare('SELECT * FROM lots WHERE id=? AND owner_user_id=?').bind(requireId(lotId),user.id).first();
  if(!lot)fail('Lot not found.',404);
  const item=await env.DB.prepare('SELECT * FROM lot_items WHERE lot_id=? AND id=?').bind(lot.id,requireId(itemId)).first();
  if(!item)fail('Material line not found.',404);
  const used=await env.DB.prepare(`SELECT coalesce(sum(quantity_base),0) AS n FROM reservations WHERE lot_id=? AND item_id=? AND ${allocated}`).bind(lot.id,item.id).first();
  return {lot,item,available:(item.quantity_base||0)-used.n};
}
function exclusions(r,s,amount,env){const reasons=[];
  if(r.state!=='active')reasons.push('Requirement is paused');
  if(r.valid_until<=now())reasons.push('Requirement has expired');
  if(!eligible(env,r))reasons.push('Facility verification is incomplete');
  if(s.item.review_state!=='confirmed')reasons.push('Confirm the material category first');
  if(s.item.broad_code!==r.broad_code)reasons.push('Different broad category');
  if(r.detailed_code&&s.item.detailed_code&&r.detailed_code!==s.item.detailed_code)reasons.push('Different detailed category');
  if(s.item.unit!==r.unit)reasons.push('Different quantity unit');
  if(!JSON.parse(r.areas_json).includes(s.lot.locality.trim().toLowerCase()))reasons.push('Collection area is outside service areas');
  if(s.item.unit===r.unit&&(!amount||amount<r.minimum_base))reasons.push('Quantity is below minimum demand');
  if(amount>s.available)reasons.push('Not enough unreserved collector stock');
  if(s.item.unit===r.unit&&r.target_base!==null&&amount>r.target_base-r.allocated_base)reasons.push('Quantity exceeds remaining demand');
  return reasons;
}
async function matches(request,env,user){
  requireRole(user,'collector');const url=new URL(request.url),s=await source(env,user,url.searchParams.get('lotId'),url.searchParams.get('itemId'));
  const amount=url.searchParams.has('quantity')?quantityBase(url.searchParams.get('quantity'),s.item.unit):s.available;
  const page=await rows(env.DB.prepare(requirementSelect+" WHERE r.broad_code=? AND r.id>? AND u.status='active' AND r.state='active' AND ("+reviewed+" OR (?=1 AND EXISTS(SELECT 1 FROM demo_facility_access d WHERE d.facility_id=f.id AND d.expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now')))) AND r.valid_until>? ORDER BY r.id LIMIT 51").bind(s.item.broad_code||'',cursor(request),env.DEMO_MODE==='true'?1:0,now()));
  return json({lotVersion:s.lot.version,available:quantity(s.available,s.item.unit),matches:page.slice(0,50).map(r=>({...projectRequirement(r,env),exclusions:exclusions(r,s,amount,env),detailedReviewRequired:!!r.detailed_code&&!s.item.detailed_code})),nextCursor:page.length>50?page[49].id:null});
}
async function permittedRequest(env,user,record){
  const row=await env.DB.prepare('SELECT * FROM supply_requests WHERE id=? AND (collector_id=? OR recycler_id=?)').bind(requireId(record),user.id,user.id).first();
  if(!row)fail('Request not found.',404);return row;
}
function projectRequest(r){return {id:r.id,collectorId:r.collector_id,recyclerId:r.recycler_id,requirementId:r.requirement_id,lotId:r.lot_id,itemId:r.item_id,quantity:quantity(r.quantity_base,r.unit),unit:r.unit,mode:r.mode,
  ask:rupees(r.ask_paise),snapshot:JSON.parse(r.snapshot_json),state:r.state,version:r.version,expiresAt:r.expires_at,createdAt:r.created_at};}
function projectOrder(r){return {id:r.id,requestId:r.request_id,collectorId:r.collector_id,recyclerId:r.recycler_id,facilityId:r.facility_id,state:r.state,version:r.version,materialAmount:rupees(r.material_paise),termsVersion:r.terms_version,logistics:'Not arranged; recycler pays separately',paymentState:paymentState(r),createdAt:r.created_at};}
async function requestsRoute(request,env,user,record,action){
  if(request.method==='GET'){
    if(record){const row=await permittedRequest(env,user,record);const events=await rows(env.DB.prepare('SELECT id,actor_id AS actorId,kind,message,created_at AS createdAt FROM market_events WHERE request_id=? ORDER BY created_at DESC,id DESC LIMIT 100').bind(record));
      const order=await env.DB.prepare(`SELECT o.*,${paymentColumns} FROM orders o WHERE request_id=?`).bind(record).first();return json({request:projectRequest(row),events,order:order?projectOrder(order):null});}
    const page=await rows(env.DB.prepare('SELECT * FROM supply_requests WHERE (collector_id=? OR recycler_id=?) AND id>? ORDER BY id LIMIT 51').bind(user.id,user.id,cursor(request)));
    return json({requests:page.slice(0,50).map(projectRequest),nextCursor:page.length>50?page[49].id:null});
  }
  if(request.method!=='POST'||!record)fail('Method not supported.',405);requireId(record);
  const c=await command(request,env,user);if(c.previous)return c.previous;const input=c.input,time=now();
  if(!action){
    requireRole(user,'collector');const s=await source(env,user,input.lotId,input.itemId),r=await getRequirement(env,input.requirementId);
    if(!r)fail('Requirement not found.',404);
    if(s.lot.version!==input.lotVersion||r.version!==input.requirementVersion)fail('The draft or requirement changed. Review the current version.',409);
    const amount=quantityBase(input.quantity,s.item.unit),why=exclusions(r,s,amount,env);
    if(why.length)fail(why.join('. ')+'.',409);
    if(!JSON.parse(r.modes_json).includes(input.mode))fail('Choose an offered pickup/drop-off mode.');
    const ask=money(input.ask,true),estimate=materialAmount(r.rate_paise,amount,r.unit);
    const photos=await rows(env.DB.prepare('SELECT file_id FROM lot_files WHERE lot_id=?').bind(s.lot.id));
    if(input.sharePhotos!==true&&photos.length)fail('Confirm sharing these lot photos with the selected recycler.');
    const snapshot={lotTitle:s.lot.title,locality:s.lot.locality,description:s.item.description,condition:s.item.condition,broadCode:s.item.broad_code,detailedCode:s.item.detailed_code,
      requirement:projectRequirement(r,env),estimatePaise:estimate,estimatedMaterial:rupees(estimate),collectorProposal:rupees(ask??estimate),fileIds:photos.map(f=>f.file_id),reviewedAt:time};
    const expires=new Date(Math.min(Date.parse(r.valid_until),Date.now()+7*86400000)).toISOString();
    const first=env.DB.prepare(`INSERT INTO supply_requests(id,collector_id,recycler_id,requirement_id,requirement_version,lot_id,lot_version,item_id,quantity_base,unit,mode,ask_paise,snapshot_json,state,version,expires_at,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,'submitted',1,?,?,?)`).bind(record,user.id,r.owner_id,r.id,r.version,s.lot.id,s.lot.version,s.item.id,amount,s.item.unit,input.mode,ask,JSON.stringify(snapshot),expires,time,time);
    return commit(env,c,first,{id:record,version:1},[(g,a)=>env.DB.prepare(`INSERT INTO request_files(request_id,file_id) SELECT ?,file_id FROM lot_files WHERE lot_id=? AND ${g}`).bind(record,s.lot.id,...a),event(env,record,user.id,'submitted','Collector submitted the reviewed material proposal')]);
  }
  const row=await permittedRequest(env,user,record);if(row.version!==version(input))fail('Request changed. Refresh before responding.',409);
  if(!activeStates.includes(row.state))fail('This request no longer accepts responses.',409);
  if(action==='review-category'){
    if(row.recycler_id!==user.id)fail('Only the addressed recycler can confirm the detailed category.',403);
    const category=CATALOG.categories.find(c=>c.code===input.code);if(!category)fail('Choose one of the 106 equipment codes.');
    const broad=JSON.parse(row.snapshot_json).broadCode;
    if(category.broad_category_id!==broad)fail('This detailed code maps to a different broad group. Ask the collector to correct the lot and resubmit.',409);
    const evidence=JSON.stringify({code:category.code,name:category.name,taxonomyVersion:CATALOG.version,requestVersion:row.version+1});
    return commit(env,c,env.DB.prepare("UPDATE supply_requests SET version=version+1,updated_at=? WHERE id=? AND version=? AND state IN ('submitted','clarification')").bind(time,record,row.version),{id:record,version:row.version+1},[event(env,record,user.id,'category.confirmed',evidence)]);
  }
  if(action==='accept'){
    if(row.recycler_id!==user.id)fail('Only the addressed recycler can accept.',403);
    const r=await getRequirement(env,row.requirement_id),orderId=id(),amount=row.ask_paise??JSON.parse(row.snapshot_json).estimatePaise;
    if(!eligible(env,r))fail('Facility verification is required before accepting.',403);
    const first=env.DB.prepare(`INSERT INTO orders(id,request_id,collector_id,recycler_id,facility_id,state,version,material_paise,terms_version,created_at,updated_at)
      SELECT ?,?,?,?,?,'accepted',1,?,1,?,? WHERE EXISTS(SELECT 1 FROM supply_requests WHERE id=? AND version=? AND state IN ('submitted','clarification'))`).bind(orderId,record,row.collector_id,row.recycler_id,r.facility_id,amount,time,time,record,row.version);
    return commit(env,c,first,{id:orderId,requestId:record,version:1},[event(env,record,user.id,'accepted','Recycler accepted; supply and demand reserved. Logistics and payment remain separate.')]);
  }
  const message=text(input.message,2000,'message');if(!message)fail('Enter a reason or clarification.');
  let state;
  if(action==='clarify')state='clarification';
  else if(action==='reject'&&row.recycler_id===user.id)state='rejected';
  else if(action==='withdraw'&&row.collector_id===user.id)state='withdrawn';
  else fail('This action is not allowed.',403);
  return commit(env,c,env.DB.prepare("UPDATE supply_requests SET state=?,version=version+1,updated_at=? WHERE id=? AND version=? AND state IN ('submitted','clarification')").bind(state,time,record,row.version),{id:record,version:row.version+1},[event(env,record,user.id,action,message)]);
}
async function permittedOrder(env,user,record){const row=await env.DB.prepare(`SELECT o.*,${paymentColumns} FROM orders o WHERE id=? AND (collector_id=? OR recycler_id=?)`).bind(requireId(record),user.id,user.id).first();if(!row)fail('Order not found.',404);return row;}
async function ordersRoute(request,env,user,record,action){
  if(request.method==='GET'){
    if(record){const o=await permittedOrder(env,user,record),r=await permittedRequest(env,user,o.request_id);
      const terms=await rows(env.DB.prepare('SELECT version,proposed_by AS proposedBy,amount_paise AS amountPaise,reason,status,acknowledged_by AS acknowledgedBy,created_at AS createdAt FROM order_terms WHERE order_id=? ORDER BY version DESC LIMIT 50').bind(record));
      const events=await rows(env.DB.prepare('SELECT id,actor_id AS actorId,kind,message,created_at AS createdAt FROM market_events WHERE request_id=? ORDER BY created_at DESC,id DESC LIMIT 100').bind(o.request_id));
      const logistics=await env.DB.prepare('SELECT state,pickup_json FROM logistics_jobs WHERE order_id=?').bind(record).first();
      return json({order:{...projectOrder(o),logistics:logistics?logistics.state+'; recycler pays separately':projectOrder(o).logistics,canCancel:o.state==='accepted'&&!logistics?.pickup_json},request:projectRequest(r),terms,events});}
    const page=await rows(env.DB.prepare(`SELECT o.*,${paymentColumns} FROM orders o WHERE (collector_id=? OR recycler_id=?) AND id>? ORDER BY id LIMIT 51`).bind(user.id,user.id,cursor(request)));
    return json({orders:page.slice(0,50).map(projectOrder),nextCursor:page.length>50?page[49].id:null});
  }
  if(request.method!=='POST'||!record||!action)fail('Method not supported.',405);
  const c=await command(request,env,user);if(c.previous)return c.previous;
  const o=await permittedOrder(env,user,record),v=version(c.input),time=now();
  if(o.version!==v||o.state!=='accepted')fail('Order changed or is no longer open. Refresh first.',409);
  const guardSql="WHERE id=? AND version=? AND state='accepted'";
  if(action==='cancel'){
    const reason=text(c.input.message,2000,'cancellation reason');if(!reason)fail('Enter a cancellation reason.');
    return commit(env,c,env.DB.prepare(`UPDATE orders SET state='cancelled',version=version+1,updated_at=? ${guardSql}`).bind(time,record,v),{id:record,version:v+1},[event(env,o.request_id,user.id,'cancelled',reason)]);
  }
  if(action==='propose-terms'){
    const amount=money(c.input.amount),reason=text(c.input.message,2000,'revision reason');if(!reason)fail('Explain the proposed price change.');
    const revision=o.terms_version+1;
    return commit(env,c,env.DB.prepare(`UPDATE orders SET terms_version=?,version=version+1,updated_at=? ${guardSql}`).bind(revision,time,record,v),{id:record,version:v+1},[
      (g,a)=>env.DB.prepare(`UPDATE order_terms SET status='superseded' WHERE order_id=? AND status='proposed' AND ${g}`).bind(record,...a),
      (g,a)=>env.DB.prepare(`INSERT INTO order_terms(order_id,version,proposed_by,amount_paise,reason,status,created_at) SELECT ?,?,?,?,?,'proposed',? WHERE ${g}`).bind(record,revision,user.id,amount,reason,time,...a),
      event(env,o.request_id,user.id,'price.proposed',`Proposed material amount INR ${rupees(amount)}: ${reason}`)]);
  }
  if(action==='acknowledge-terms'){
    const term=await env.DB.prepare("SELECT * FROM order_terms WHERE order_id=? AND version=? AND status='proposed'").bind(record,c.input.termsVersion||0).first();
    if(!term||term.version!==o.terms_version)fail('This proposal is no longer current.',409);
    if(term.proposed_by===user.id)fail('The other party must acknowledge this proposal.',403);
    return commit(env,c,env.DB.prepare(`UPDATE orders SET material_paise=?,version=version+1,updated_at=? ${guardSql}`).bind(term.amount_paise,time,record,v),{id:record,version:v+1},[
      (g,a)=>env.DB.prepare(`UPDATE order_terms SET status='acknowledged',acknowledged_by=?,acknowledged_at=? WHERE order_id=? AND version=? AND ${g}`).bind(user.id,time,record,term.version,...a),
      event(env,o.request_id,user.id,'price.acknowledged',`Acknowledged material amount INR ${rupees(term.amount_paise)}. Final invoice remains required.`)]);
  }
  fail('Unknown order action.',404);
}
export async function sharedPhoto(env,user,requestId,fileId){
  await permittedRequest(env,user,requestId);requireId(fileId);
  const file=await env.DB.prepare("SELECT f.* FROM request_files rf JOIN files f ON f.id=rf.file_id WHERE rf.request_id=? AND rf.file_id=? AND f.state='ready'").bind(requestId,fileId).first();
  if(!file)fail('Shared photo not found.',404);return file;
}
export async function marketplaceRoute(request,env,user,path){
  if(path==='/api/v1/matches'&&request.method==='GET')return matches(request,env,user);
  const photo=path.match(/^\/api\/v1\/requests\/([^/]+)\/photos\/([^/]+)$/);
  if(photo&&request.method==='GET'){
    const file=await sharedPhoto(env,user,photo[1],photo[2]);if(!env.ACCOUNT_BUCKET)fail('Photo storage unavailable.',503);
    const object=await env.ACCOUNT_BUCKET.get(file.object_key);if(!object)fail('Photo unavailable.',503);
    return new Response(object.body,{headers:{'Content-Type':file.mime_type,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
  }
  const route=path.match(/^\/api\/v1\/(requirements|requests|orders)(?:\/([^/]+))?(?:\/([^/]+))?$/);
  if(!route)return null;
  if(route[1]==='requirements'){if(route[3])fail('Not found.',404);return requirementsRoute(request,env,user,route[2]);}
  if(route[1]==='requests')return requestsRoute(request,env,user,route[2],route[3]);
  return ordersRoute(request,env,user,route[2],route[3]);
}
