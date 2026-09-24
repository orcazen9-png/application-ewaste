import {CATALOG} from '../../dist/waste-catalog.js';
import {fail,id,json,now,requireId,requireRole,rows,text} from './common.js';
import {begin,commit} from './commands.js';
import {quantity,rupees,money} from './marketplace.js';
const stmt=(e,s,...a)=>e.DB.prepare(s).bind(...a);
export function coordinates(value){
 if(value==null)return null;
 if(typeof value!=='object'||typeof value.latitude!=='number'||typeof value.longitude!=='number'||!Number.isFinite(value.latitude)||!Number.isFinite(value.longitude)||Math.abs(value.latitude)>90||Math.abs(value.longitude)>180)fail('Choose a valid location.');
 return {latitude:Math.round(value.latitude*100)/100,longitude:Math.round(value.longitude*100)/100};
}
function filters(request){const q=new URL(request.url).searchParams,point=q.has('lat')||q.has('lon')?coordinates({latitude:Number(q.get('lat')),longitude:Number(q.get('lon'))}):null;
 if(point&&(!q.get('lat')||!q.get('lon')))fail('Both location coordinates are required.');
 const radius=q.has('radius')?Number(q.get('radius')):null,page=Number(q.get('page')||0);if(!Number.isInteger(page)||page<0||page>200||(radius!==null&&(!Number.isFinite(radius)||radius<1||radius>500)))fail('Choose a radius from 1 to 500 km.');
 const code=q.get('material')||'';if(code&&!CATALOG.broad_categories.some(c=>c.id===code))fail('Choose a valid material.');
 return {point,radius,page,code,originLabel:point?'Selected location':'',noOrigin:q.get('location')==='off',search:text(q.get('search')||'',120,'search'),pickup:q.get('pickup')==='true'};}
async function origin(env,user,q){
 if(q.point||q.noOrigin)return q;
 const row=user.role==='recycler'
  ?await stmt(env,`SELECT json_extract(p.profile_json,'$.location.latitude') latitude,json_extract(p.profile_json,'$.location.longitude') longitude,json_extract(p.profile_json,'$.locality') label FROM facility_profiles p JOIN facilities f ON f.id=p.facility_id JOIN organizations o ON o.id=f.organization_id WHERE o.owner_user_id=?`,user.id).first()
  :await stmt(env,`SELECT p.latitude,p.longitude,l.locality label FROM lot_listings p JOIN lots l ON l.id=p.lot_id WHERE p.owner_id=? AND p.state='posted' AND p.latitude IS NOT NULL ORDER BY p.updated_at DESC LIMIT 1`,user.id).first();
 if(row&&row.latitude!=null&&row.longitude!=null){q.point=coordinates(row);q.originLabel=row.label||'Saved location';}return q;
}
const originData=q=>q.point?{...q.point,label:q.originLabel}:null;
function distanceKm(point,location){if(!point||!location||location.latitude==null||location.longitude==null)return null;const mean=(point.latitude+location.latitude)*Math.PI/360,dy=(point.latitude-location.latitude)*111.32,dx=(point.longitude-location.longitude)*111.32*Math.cos(mean);return Math.round(Math.hypot(dx,dy));}
function distance(point,lat,lon){if(!point)return 'NULL';const x=111.32*Math.cos(point.latitude*Math.PI/180);return `((${lat}-${point.latitude})*(${lat}-${point.latitude})*12392.1424+(${lon}-${point.longitude})*(${lon}-${point.longitude})*${x*x})`;}
const activeAuthorization=`f.verification_status='verified' AND p.status='approved' AND p.valid_until>strftime('%Y-%m-%dT%H:%M:%fZ','now') AND a.status='verified' AND a.submission_version=p.submitted_version AND a.valid_until>strftime('%Y-%m-%dT%H:%M:%fZ','now') AND u.status='active' AND json_extract(p.profile_json,'$.directoryConsent')=1`;
const directoryFrom=`FROM facilities f JOIN organizations o ON o.id=f.organization_id JOIN users u ON u.id=o.owner_user_id JOIN facility_profiles p ON p.facility_id=f.id JOIN directory_authorizations a ON a.facility_id=f.id`;
async function directory(request,env,user,record){
 requireRole(user,'collector');const q=await origin(env,user,filters(request)),lat="json_extract(p.profile_json,'$.location.latitude')",lon="json_extract(p.profile_json,'$.location.longitude')",dist=distance(q.point,lat,lon);
 const where=[activeAuthorization],args=[];if(record){where.push('f.id=?');args.push(requireId(record));}
 if(q.code){where.push("EXISTS(SELECT 1 FROM json_each(p.profile_json,'$.categories') WHERE value=?)");args.push(q.code);}
 if(q.search){where.push("(lower(json_extract(p.profile_json,'$.name')) LIKE ? OR lower(json_extract(p.profile_json,'$.locality')) LIKE ? OR lower(json_extract(p.profile_json,'$.areas')) LIKE ?)");args.push(...Array(3).fill('%'+q.search.toLowerCase()+'%'));}
 if(q.pickup)where.push("json_extract(p.profile_json,'$.pickup')=1");if(q.point&&q.radius!==null&&!record)where.push(`${dist}<=${q.radius*q.radius}`);
 const found=await rows(stmt(env,`SELECT f.id,o.owner_user_id,p.profile_json,a.source,a.valid_until,a.checked_at,${dist} AS distance_sq ${directoryFrom} WHERE ${where.join(' AND ')} ORDER BY ${q.point?'distance_sq IS NULL,distance_sq,':''}f.id LIMIT 51 OFFSET ?`,...args,q.page*50));
 const entries=found.slice(0,50),ids=entries.map(x=>x.id);
 const rates=ids.length?await rows(stmt(env,`SELECT * FROM requirements WHERE facility_id IN (${ids.map(()=>'?').join(',')}) AND state='active' AND valid_until>? ORDER BY updated_at DESC`,...ids,now())):[];
 const recyclers=entries.map(row=>{const p=JSON.parse(row.profile_json);return {id:row.id,recyclerId:row.owner_user_id,name:p.name,address:p.address,locality:p.locality,contact:p.contact,phone:p.phone||'',email:p.email||'',hours:p.hours,areas:p.areas,pickup:p.pickup,categories:p.categories,location:p.location||null,distanceKm:row.distance_sq===null?null:Math.round(Math.sqrt(row.distance_sq)),authorization:{status:'verified',authority:p.authority,registration:p.registration,source:row.source,validUntil:row.valid_until,checkedAt:row.checked_at},rates:rates.filter(r=>r.facility_id===row.id&&p.categories.includes(r.broad_code)).map(r=>({id:r.id,title:r.title,broadCode:r.broad_code,unit:r.unit,rate:rupees(r.rate_paise),minimum:quantity(r.minimum_base,r.unit),validUntil:r.valid_until,areas:JSON.parse(r.areas_json),modes:JSON.parse(r.modes_json)}))};});
 if(record){if(!recyclers.length)fail('This recycler is not currently listed in the authorized directory.',404);return json({recycler:recyclers[0],origin:originData(q)});}
 return json({recyclers,origin:originData(q),nextPage:found.length>50?q.page+1:null});
}
export async function directoryReview(request,env,user,f,p){
 const c=await begin(request,env,user);if(c.previous)return c.previous;
 const old=await stmt(env,'SELECT * FROM directory_authorizations WHERE facility_id=?',f.id).first(),input=c.input;
 if((old?.version||0)!==input.expectedVersion||!p||p.submitted_version!==input.submissionVersion)fail('The authorization or facility changed. Refresh before reviewing.',409);
 if(!['verified','revoked'].includes(input.status))fail('Choose verified or revoked.');
 const source=text(input.source,1000,'official verification source'),date=Date.parse(input.validUntil);
 if(!source||!/^https:\/\/[^\s]+$/i.test(source))fail('Enter the official register or authority source URL checked.');
 if(!Number.isFinite(date))fail('Enter an authorization expiry.');const until=new Date(date).toISOString();
 if(input.status==='verified'&&(p.status!=='approved'||p.valid_until<=now()||until<=now()||until>p.valid_until||input.confirmed!==true))fail('Confirm current authorization against the source; expiry cannot exceed the facility review.');
 const v=input.expectedVersion+1,time=now(),snapshot={status:input.status,source,validUntil:until,submissionVersion:p.submitted_version,reviewer:user.id};
 return commit(env,c,stmt(env,`INSERT INTO directory_authorizations(facility_id,submission_version,version,status,source,valid_until,reviewer_id,checked_at) SELECT ?,?,1,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM facility_profiles WHERE facility_id=? AND version=?) AND (?=0 OR EXISTS(SELECT 1 FROM directory_authorizations WHERE facility_id=? AND version=?)) ON CONFLICT(facility_id) DO UPDATE SET submission_version=excluded.submission_version,version=directory_authorizations.version+1,status=excluded.status,source=excluded.source,valid_until=excluded.valid_until,reviewer_id=excluded.reviewer_id,checked_at=excluded.checked_at WHERE directory_authorizations.version=?`,f.id,p.submitted_version,input.status,source,until,user.id,time,f.id,p.version,input.expectedVersion,f.id,input.expectedVersion,input.expectedVersion),{id:f.id,version:v},[
 (g,a)=>stmt(env,`INSERT INTO directory_authorization_history SELECT ?,?,?,?,? WHERE ${g}`,id(),f.id,v,JSON.stringify(snapshot),time,...a),
 (g,a)=>stmt(env,`INSERT INTO notifications(id,user_id,kind,title,body,resource_id,created_at) SELECT ?,?,'facility.directory','Directory authorization updated',?,?,? WHERE ${g}`,id(),f.owner_user_id,input.status,f.id,time,...a)]);
}
const listingFrom=`FROM lot_listings p JOIN lots l ON l.id=p.lot_id JOIN users u ON u.id=p.owner_id`;
const available=`p.state='posted' AND l.version=p.lot_version AND u.status='active' AND EXISTS(SELECT 1 FROM lot_items i WHERE i.lot_id=l.id AND i.quantity_base>coalesce((SELECT sum(r.quantity_base) FROM reservations r WHERE r.lot_id=l.id AND r.item_id=i.id AND r.state IN ('held','consumed')),0))`;
export async function postedLot(env,record){return stmt(env,`SELECT l.*,p.version AS listing_version,p.latitude,p.longitude,p.asking_rates_json,u.display_name ${listingFrom} WHERE l.id=? AND ${available}`,requireId(record)).first();}
async function listingData(env,lot){const items=await rows(stmt(env,`SELECT i.*,coalesce((SELECT sum(r.quantity_base) FROM reservations r WHERE r.lot_id=i.lot_id AND r.item_id=i.id AND r.state IN ('held','consumed')),0) AS allocated FROM lot_items i WHERE lot_id=?`,lot.id));
 return {id:lot.id,title:lot.title,locality:lot.locality,aggregator:lot.display_name,lotVersion:lot.version,listingVersion:lot.listing_version,location:lot.latitude===null?null:{latitude:lot.latitude,longitude:lot.longitude},items:items.map(i=>({id:i.id,name:i.name,description:i.description,broadCode:i.broad_code,condition:i.condition,unit:i.unit,quantity:quantity(i.quantity_base,i.unit),available:quantity(Math.max(0,i.quantity_base-i.allocated),i.unit),askingRate:rupees(JSON.parse(lot.asking_rates_json||'{}')[i.id]??null)})),fileIds:(await rows(stmt(env,'SELECT file_id FROM lot_files WHERE lot_id=?',lot.id))).map(x=>x.file_id)};
}
async function listing(request,env,user,record,photo){
 if(request.method==='GET'){
  if(record){const own=await stmt(env,'SELECT l.*,p.version AS listing_version,p.latitude,p.longitude,p.asking_rates_json,u.display_name FROM lots l JOIN users u ON u.id=l.owner_user_id LEFT JOIN lot_listings p ON p.lot_id=l.id WHERE l.id=? AND l.owner_user_id=?',requireId(record),user.id).first();
   const lot=own||await postedLot(env,record);if(!lot||(user.role!=='recycler'&&!own))fail('Posted lot not found.',404);
   if(photo){requireId(photo);const f=await stmt(env,"SELECT f.* FROM lot_files lf JOIN files f ON f.id=lf.file_id WHERE lf.lot_id=? AND f.id=? AND f.state='ready'",record,photo).first();if(!f)fail('Photo not found.',404);const object=await env.ACCOUNT_BUCKET.get(f.object_key);if(!object)fail('Photo unavailable.',404);return new Response(object.body,{headers:{'Content-Type':f.mime_type,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});}
   const q=await origin(env,user,filters(request)),data=await listingData(env,lot);data.distanceKm=distanceKm(q.point,data.location);const p=own?await stmt(env,'SELECT * FROM lot_listings WHERE lot_id=?',record).first():null;return json({lot:data,origin:originData(q),listing:own?{version:p?.version||0,state:p?.state||'draft',current:p?.lot_version===lot.version}:null});
  }
  requireRole(user,'recycler');const q=await origin(env,user,filters(request)),dist=distance(q.point,'p.latitude','p.longitude'),where=[available],args=[];
  if(q.point&&q.radius!==null)where.push(`${dist}<=${q.radius*q.radius}`);if(q.search){where.push('(lower(l.locality) LIKE ? OR lower(l.title) LIKE ?)');args.push(...Array(2).fill('%'+q.search.toLowerCase()+'%'));}
  if(q.code){where.push('EXISTS(SELECT 1 FROM lot_items WHERE lot_id=l.id AND broad_code=?)');args.push(q.code);}
  const page=await rows(stmt(env,`SELECT l.id,l.title,l.locality,u.display_name AS aggregator,p.latitude,p.longitude,p.updated_at,${dist} AS distance_sq ${listingFrom} WHERE ${where.join(' AND ')} ORDER BY ${q.point?'distance_sq IS NULL,distance_sq,':''}p.updated_at DESC,l.id LIMIT 51 OFFSET ?`,...args,q.page*50));
  return json({lots:page.slice(0,50).map(l=>({...l,location:l.latitude===null?null:{latitude:l.latitude,longitude:l.longitude},distanceKm:l.distance_sq===null?null:Math.round(Math.sqrt(l.distance_sq))})),origin:originData(q),nextPage:page.length>50?q.page+1:null});
 }
 requireRole(user,'collector');if(request.method!=='PUT'||!record||photo)fail('Method not supported.',405);requireId(record);
 const c=await begin(request,env,{...user,actor:'user:'+user.id});if(c.previous)return c.previous;const i=c.input;
 const lot=await stmt(env,'SELECT * FROM lots WHERE id=? AND owner_user_id=?',record,user.id).first();if(!lot)fail('Lot not found.',404);
 if(lot.version!==i.lotVersion)fail('Save and review the latest lot before posting.',409);
 if(!['posted','paused','withdrawn'].includes(i.state))fail('Choose a listing status.');
 const point=coordinates(i.location);
 const old=await stmt(env,'SELECT asking_rates_json FROM lot_listings WHERE lot_id=?',record).first();
 const lines=await rows(stmt(env,'SELECT id FROM lot_items WHERE lot_id=?',record)),allowed=new Set(lines.map(x=>x.id));
 let rates=Object.fromEntries(Object.entries(JSON.parse(old?.asking_rates_json||'{}')).filter(([key])=>allowed.has(key)));
 if(Object.hasOwn(i,'askingRates')){
  if(!i.askingRates||typeof i.askingRates!=='object'||Array.isArray(i.askingRates)||Object.keys(i.askingRates).length>20)fail('Enter a valid asking price for each material.');
  rates={};for(const [key,value] of Object.entries(i.askingRates)){if(!allowed.has(key))fail('Choose a material from this lot.');const rate=money(value,true);if(rate!==null){if(rate<=0)fail('Asking price must be greater than zero.');rates[key]=rate;}}
 }

 if(i.state==='posted'){
  if(i.sharePhotos!==true)fail('Confirm publishing these material details and photos to registered recyclers.');
  const items=await rows(stmt(env,'SELECT * FROM lot_items WHERE lot_id=?',record));
  if(!lot.title||!lot.locality||!items.length||items.some(x=>!x.broad_code||x.review_state!=='confirmed'||!x.quantity_base))fail('Complete and confirm all materials before posting.');
 }
 const v=i.expectedVersion+1,time=now();return commit(env,c,stmt(env,`INSERT INTO lot_listings(lot_id,owner_id,lot_version,version,state,latitude,longitude,asking_rates_json,created_at,updated_at) SELECT ?,?,?,1,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM lots WHERE id=? AND version=? AND owner_user_id=?) AND (?=0 OR EXISTS(SELECT 1 FROM lot_listings WHERE lot_id=? AND version=?)) ON CONFLICT(lot_id) DO UPDATE SET lot_version=excluded.lot_version,version=lot_listings.version+1,state=excluded.state,latitude=excluded.latitude,longitude=excluded.longitude,asking_rates_json=excluded.asking_rates_json,updated_at=excluded.updated_at WHERE lot_listings.version=? AND lot_listings.owner_id=?`,record,user.id,lot.version,i.state,point?.latitude??null,point?.longitude??null,JSON.stringify(rates),time,time,record,lot.version,user.id,i.expectedVersion,record,i.expectedVersion,i.expectedVersion,user.id),{id:record,version:v});
}
export async function discoveryRoute(request,env,user,path){
 const dir=path.match(/^\/api\/v1\/directory(?:\/([^/]+))?$/);if(dir){if(request.method!=='GET')fail('Method not supported.',405);return directory(request,env,user,dir[1]);}
 const route=path.match(/^\/api\/v1\/listings(?:\/([^/]+))?(?:\/photos\/([^/]+))?$/);if(route)return listing(request,env,user,route[1],route[2]);return null;
}
