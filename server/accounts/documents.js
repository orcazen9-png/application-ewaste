import {bytes,fail,hash,json,now,requireId,text} from './common.js';
import {imageInfo} from './files.js';
export function documentInfo(data,declared){
  let mime;
  if(declared==='application/pdf'){
    if(!/^(%PDF-1\.[0-9]|%PDF-2\.0)/.test(new TextDecoder().decode(data.subarray(0,9)))||!new TextDecoder().decode(data.subarray(Math.max(0,data.length-1024))).includes('%%EOF'))fail('Choose a complete PDF document.',415);mime=declared;
  }else mime=imageInfo(data).type;
  if(mime!==declared)fail('Document type does not match its contents.',415);return mime;
}
export const financeStaff=user=>!!user.staff&&['finance','operations_finance'].includes(user.role);
export async function financeOrder(env,user,orderId){
  requireId(orderId);const o=await env.DB.prepare(`SELECT o.*,s.quantity_base,s.unit,j.accepted_base,j.cost_json,j.cost_version,j.cost_ack_version
    FROM orders o JOIN supply_requests s ON s.id=o.request_id LEFT JOIN logistics_jobs j ON j.order_id=o.id WHERE o.id=?`).bind(orderId).first();
  if(!o||(!user.staff&&![o.collector_id,o.recycler_id].includes(user.id)))fail('Order not found.',404);return o;
}
export async function ownedDocument(env,user,o,documentId){
  requireId(documentId);const d=await env.DB.prepare("SELECT * FROM documents WHERE id=? AND order_id=? AND owner_actor=? AND state='ready'").bind(documentId,o.id,user.actor).first();
  if(!d)fail('Upload your own document for this order first.',404);return d;
}
export async function documentRoute(request,env,user,o,documentId){
  requireId(documentId);if(!env.ACCOUNT_BUCKET)fail('Private document storage is unavailable.',503);
  const old=await env.DB.prepare('SELECT * FROM documents WHERE id=? AND order_id=?').bind(documentId,o.id).first();
  if(request.method==='GET'){
    const shared=old&&await env.DB.prepare(`SELECT 1 FROM invoice_versions WHERE document_id=? UNION ALL SELECT 1 FROM payments WHERE proof_id=? LIMIT 1`).bind(documentId,documentId).first();
    if(!old||old.state!=='ready'||(old.owner_actor!==user.actor&&!shared))fail('Document not found.',404);
    const obj=await env.ACCOUNT_BUCKET.get(old.object_key);if(!obj)fail('Document is temporarily unavailable.',503);
    return new Response(obj.body,{headers:{'Content-Type':old.mime,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"sandbox; default-src 'none'",'Content-Disposition':`attachment; filename="document.${old.mime==='application/pdf'?'pdf':old.mime==='image/png'?'png':'jpg'}"; filename*=UTF-8''${encodeURIComponent(old.name)}`}});
  }
  if(request.method!=='PUT')fail('Method not supported.',405);
  if(user.staff&&!financeStaff(user))fail('Finance permission is required to upload documents.',403);
  if(old&&old.owner_actor!==user.actor)fail('Document not found.',404);
  const data=await bytes(request,5242880),mime=documentInfo(data,request.headers.get('Content-Type')?.split(';')[0]);
  const digest=await hash(data),name=text(new URL(request.url).searchParams.get('name')||'document',150,'document name');
  if(/[\r\n/\\]/.test(name)||!name)fail('Choose a valid document filename.');
  if(old&&old.sha256!==digest)fail('Documents are immutable. Upload a new revision.',409);
  const key=`documents/${o.id}/${documentId}/${digest}`;
  await env.DB.prepare(`INSERT INTO documents(id,owner_actor,order_id,object_key,name,mime,size,sha256,state,created_at)
    SELECT ?,?,?,?,?,?,?,?,'uploading',? WHERE (SELECT count(*) FROM documents WHERE owner_actor=?)<500 AND
    (SELECT coalesce(sum(size),0) FROM documents WHERE owner_actor=?)+?<=104857600 ON CONFLICT(id) DO NOTHING`)
    .bind(documentId,user.actor,o.id,key,name,mime,data.length,digest,now(),user.actor,user.actor,data.length).run();
  const claimed=await env.DB.prepare('SELECT * FROM documents WHERE id=?').bind(documentId).first();
  if(!claimed)fail('Your document allowance is full.',413);
  if(claimed.owner_actor!==user.actor||claimed.order_id!==o.id||claimed.sha256!==digest)fail('Document reference is already used.',409);
  if(claimed.state!=='ready'){await env.ACCOUNT_BUCKET.put(key,data,{httpMetadata:{contentType:mime}});await env.DB.prepare("UPDATE documents SET state='ready' WHERE id=? AND sha256=?").bind(documentId,digest).run();}
  return json({id:documentId,name:claimed.name,mime,size:data.length,sha256:digest},old?200:201);
}
