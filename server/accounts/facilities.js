import {CATALOG} from '../../dist/waste-catalog.js';
import {begin,commit} from './commands.js';
import {bytes,fail,hash,id,json,now,requireId,rows,text} from './common.js';
import {documentInfo} from './documents.js';

const stmt=(env,sql,...args)=>env.DB.prepare(sql).bind(...args);
const reviewer=u=>u.staff&&['operations','operations_finance'].includes(u.role);
const needed=(value,max,label)=>{const result=text(value,max,label);if(!result)fail('Enter '+label+'.');return result;};
const effective=p=>p?.status==='approved'&&p.valid_until<=now()?'expired':p?.status||'draft';
async function owned(env,user,facilityId){
 if(!user.staff&&user.role!=='recycler')fail('Recycler access is required.',403);
 const f=await stmt(env,'SELECT f.*,o.owner_user_id FROM facilities f JOIN organizations o ON o.id=f.organization_id WHERE '+(user.staff?'f.id=?':'o.owner_user_id=?'),user.staff?requireId(facilityId):user.id).first();
 if(!f)fail('Facility not found.',404);return f;
}
async function profile(env,f){return stmt(env,'SELECT * FROM facility_profiles WHERE facility_id=?',f.id).first();}
async function projection(env,user,f){
 const p=await profile(env,f),data=p?JSON.parse(p.profile_json):{name:f.name,locality:f.locality,categories:[],documentIds:[]};
 const reviews=await rows(stmt(env,`SELECT r.*,s.name AS reviewer FROM facility_reviews r JOIN operations_staff s ON s.id=r.reviewer_id WHERE r.facility_id=? ORDER BY r.created_at DESC,r.id DESC LIMIT 50`,f.id));
 const documents=await rows(stmt(env,`SELECT d.id,d.name,d.mime,d.size FROM facility_documents d WHERE d.facility_id=? AND d.state='ready' ${user.staff?"AND EXISTS(SELECT 1 FROM facility_submissions s,json_each(s.snapshot_json,'$.documentIds') j WHERE s.facility_id=d.facility_id AND j.value=d.id)":''} ORDER BY d.created_at DESC LIMIT 100`,f.id));
 const submissions=user.staff?await rows(stmt(env,'SELECT version,snapshot_json,created_at FROM facility_submissions WHERE facility_id=? ORDER BY version DESC LIMIT 50',f.id)):[];
 return {id:f.id,version:p?.version||0,status:effective(p),profile:data,submittedVersion:p?.submitted_version||null,validUntil:p?.valid_until||null,reviews,documents,submissions:submissions.map(s=>({version:s.version,profile:JSON.parse(s.snapshot_json),createdAt:s.created_at})),reviewLabel:'Document review by Freedom Value; not government certification.'};
}
function normalize(input,submit){
 if(!input||typeof input!=='object'||Array.isArray(input))fail('Enter facility details.');
 const p={};for(const [k,max]of Object.entries({name:120,address:600,locality:120,contact:200,hours:200,areas:1000,authority:200,registration:200}))p[k]=submit?needed(input[k],max,k==='registration'?'registration or document reference':k):text(input[k],max,k);
 if(!Array.isArray(input.categories)||input.categories.length>20||input.categories.some(v=>!CATALOG.broad_categories.some(c=>c.id===v)))fail('Choose supported material categories.');p.categories=[...new Set(input.categories)];
 if(!Array.isArray(input.documentIds)||input.documentIds.length>5)fail('Attach up to five facility documents.');p.documentIds=[...new Set(input.documentIds.map(requireId))];
 p.pickup=input.pickup===true;
 p.documentExpiry=text(input.documentExpiry,10,'document expiry');if(p.documentExpiry&&(!/^\d{4}-\d{2}-\d{2}$/.test(p.documentExpiry)||!Number.isFinite(Date.parse(p.documentExpiry))||new Date(p.documentExpiry).toISOString().slice(0,10)!==p.documentExpiry))fail('Use a valid expiry date in YYYY-MM-DD format.');
 if(submit&&(!p.categories.length||!p.documentIds.length))fail('Choose at least one material category and attach registration evidence.');
 if(submit&&p.documentExpiry&&p.documentExpiry+'T23:59:59.999Z'<=now())fail('The document has expired. Upload current evidence.');return p;
}
async function documentsReady(env,user,f,p){for(const doc of p.documentIds){if(!await stmt(env,"SELECT 1 FROM facility_documents WHERE id=? AND facility_id=? AND owner_user_id=? AND state='ready'",doc,f.id,user.id).first())fail('Upload your own facility documents before submitting.',404);}}
async function file(request,env,user,f,doc){
 requireId(doc);if(!env.ACCOUNT_BUCKET)fail('Private document storage is unavailable.',503);
 const old=await stmt(env,'SELECT * FROM facility_documents WHERE id=? AND facility_id=?',doc,f.id).first();
 if(request.method==='GET'){
  if(!old||old.state!=='ready')fail('Document not found.',404);
  if(user.staff&&(!reviewer(user)||!await stmt(env,"SELECT 1 FROM facility_submissions s,json_each(s.snapshot_json,'$.documentIds') j WHERE s.facility_id=? AND j.value=? LIMIT 1",f.id,doc).first()))fail('Document not found.',404);
  const object=await env.ACCOUNT_BUCKET.get(old.object_key);if(!object)fail('Document is temporarily unavailable.',503);
  return new Response(object.body,{headers:{'Content-Type':old.mime,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"sandbox; default-src 'none'",'Content-Disposition':`attachment; filename="facility-document"; filename*=UTF-8''${encodeURIComponent(old.name)}`}});
 }
 if(request.method!=='PUT'||user.staff)fail('Only the recycler can upload facility evidence.',403);
 const data=await bytes(request,5242880),mime=documentInfo(data,request.headers.get('Content-Type')?.split(';')[0]);
 const name=needed(new URL(request.url).searchParams.get('name'),150,'filename');if(/[\r\n/\\]/.test(name))fail('Choose a valid document filename.');
 const digest=await hash(data),key=`facilities/${f.id}/${doc}/${digest}`;
 if(old&&old.sha256!==digest)fail('Documents are immutable. Upload a new revision.',409);
 await stmt(env,`INSERT INTO facility_documents(id,facility_id,owner_user_id,object_key,name,mime,size,sha256,state,created_at)
 SELECT ?,?,?,?,?,?,?,?,'uploading',? WHERE (SELECT count(*) FROM facility_documents WHERE owner_user_id=?)<100 AND (SELECT coalesce(sum(size),0) FROM facility_documents WHERE owner_user_id=?)+?<=52428800 ON CONFLICT(id) DO NOTHING`,doc,f.id,user.id,key,name,mime,data.length,digest,now(),user.id,user.id,data.length).run();
 const claim=await stmt(env,'SELECT * FROM facility_documents WHERE id=?',doc).first();if(!claim)fail('Your facility document allowance is full.',413);
 if(claim.facility_id!==f.id||claim.owner_user_id!==user.id||claim.sha256!==digest)fail('This document reference is already used.',409);
 if(claim.state!=='ready'){await env.ACCOUNT_BUCKET.put(key,data,{httpMetadata:{contentType:mime}});await stmt(env,"UPDATE facility_documents SET state='ready' WHERE id=? AND sha256=?",doc,digest).run();}
 return json({id:doc,name:claim.name,mime,size:data.length},old?200:201);
}
export async function facilityRoute(request,env,user,path){
 const personal=path.match(/^\/api\/v1\/facility(?:\/documents\/([^/]+))?$/);
 const staffPath=path.match(/^\/api\/ops\/facilities(?:\/([^/]+))?(?:\/(review|documents))?(?:\/([^/]+))?$/);
 if(!personal&&!staffPath)return null;
 user={...user,actor:user.actor||'user:'+user.id};
 if(staffPath&&!reviewer(user))fail('Operations permission is required for facility review.',403);
 if(staffPath&&!staffPath[1]){
  if(request.method!=='GET')fail('Method not supported.',405);
  const q=new URL(request.url).searchParams,after=q.get('after')||'';if(after)requireId(after);
  const page=await rows(stmt(env,`SELECT p.facility_id AS id,p.version,p.status,p.valid_until,p.updated_at,json_extract(p.profile_json,'$.name') AS name,json_extract(p.profile_json,'$.locality') AS locality,u.display_name AS recycler FROM facility_profiles p JOIN facilities f ON f.id=p.facility_id JOIN organizations o ON o.id=f.organization_id JOIN users u ON u.id=o.owner_user_id WHERE p.facility_id>? ORDER BY p.facility_id LIMIT 51`,after));
  return json({facilities:page.slice(0,50).map(p=>({...p,status:effective(p)})),nextCursor:page.length>50?page[49].id:null});
 }
 const f=await owned(env,user,staffPath?.[1]);
 const doc=personal?.[1]||(staffPath?.[2]==='documents'?staffPath[3]:null);if(doc)return file(request,env,user,f,doc);
 if(staffPath?.[3])fail('Not found.',404);
 if(request.method==='GET'&&!staffPath?.[2])return json(await projection(env,user,f));
 if(personal&&request.method==='PUT'){
  const c=await begin(request,env,user);if(c.previous)return c.previous;
  const submit=c.input.submit===true,p=normalize(c.input.profile,submit);await documentsReady(env,user,f,p);
  const version=c.input.expectedVersion+1,time=now(),snapshot=JSON.stringify(p);
  return commit(env,c,stmt(env,`INSERT INTO facility_profiles(facility_id,version,status,profile_json,submitted_version,updated_at) SELECT ?,1,?,?,?,? WHERE ?=0 OR EXISTS(SELECT 1 FROM facility_profiles WHERE facility_id=? AND version=?) ON CONFLICT(facility_id) DO UPDATE SET version=facility_profiles.version+1,status=excluded.status,profile_json=excluded.profile_json,submitted_version=?,valid_until=NULL,updated_at=excluded.updated_at WHERE facility_profiles.version=?`,f.id,submit?'pending':'draft',snapshot,submit?version:null,time,c.input.expectedVersion,f.id,c.input.expectedVersion,submit?version:null,c.input.expectedVersion),{id:f.id,version,status:submit?'pending':'draft'},[
   (g,args)=>stmt(env,`UPDATE facilities SET name=?,locality=?,verification_status=? WHERE id=? AND ${g}`,p.name,p.locality,submit?'pending':'unverified',f.id,...args),
   ...(submit?[(g,args)=>stmt(env,`INSERT INTO facility_submissions(facility_id,version,snapshot_json,created_at) SELECT ?,?,?,? WHERE ${g}`,f.id,version,snapshot,time,...args)]:[])
  ]);
 }
 if(staffPath?.[2]==='review'&&request.method==='POST'){
  const c=await begin(request,env,user);if(c.previous)return c.previous;const p=await profile(env,f),i=c.input;
  if(!p||p.version!==i.expectedVersion||!p.submitted_version||p.submitted_version!==i.submissionVersion||!['pending','approved'].includes(p.status))fail('The facility submission changed. Refresh before reviewing.',409);
  if(!['approved','rejected'].includes(i.decision)||i.decision==='approved'&&p.status!=='pending')fail('Choose a decision for the current pending submission.');
  const reason=needed(i.reason,2000,'review reason'),source=needed(i.source,1000,'evidence source checked');let until=null;
  if(i.decision==='approved'){
   const date=Date.parse(i.validUntil),submitted=JSON.parse(p.profile_json);if(!Number.isFinite(date)||date<=Date.now()||date>Date.now()+366*86400000)fail('Choose a review expiry within the next year.');until=new Date(date).toISOString();
   if(submitted.documentExpiry&&until>submitted.documentExpiry+'T23:59:59.999Z')fail('Approval cannot outlast the submitted document expiry.');
  }
  const version=p.version+1,time=now();return commit(env,c,stmt(env,"UPDATE facility_profiles SET version=version+1,status=?,valid_until=?,updated_at=? WHERE facility_id=? AND version=? AND submitted_version=? AND status IN ('pending','approved')",i.decision,until,time,f.id,p.version,p.submitted_version),{id:f.id,version,status:i.decision},[
   (g,args)=>stmt(env,`UPDATE facilities SET verification_status=? WHERE id=? AND ${g}`,i.decision==='approved'?'verified':'rejected',f.id,...args),
   (g,args)=>stmt(env,`INSERT INTO facility_reviews(id,facility_id,submission_version,reviewer_id,decision,reason,source,valid_until,created_at) SELECT ?,?,?,?,?,?,?,?,? WHERE ${g}`,id(),f.id,p.submitted_version,user.id,i.decision,reason,source,until,time,...args),
   (g,args)=>stmt(env,`INSERT INTO notifications(id,user_id,kind,title,body,resource_id,created_at) SELECT ?,?,'facility.review','Facility review updated',?,?,? WHERE ${g}`,id(),f.owner_user_id,reason,f.id,time,...args)
  ]);
 }
 fail('Method not supported.',405);
}
