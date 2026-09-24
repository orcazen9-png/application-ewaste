import {assessPhoto} from '../gemini.js';
import {body,fail,json,now,requireId} from './common.js';
import {sharedPhoto} from './marketplace.js';

export async function assessmentRoute(request,env,user,path){
  const route=path.match(/^\/api\/v1\/assessments\/([^/]+)$/);if(!route)return null;
  const assessmentId=requireId(route[1]);
  const existing=await env.DB.prepare('SELECT * FROM account_assessments WHERE id=? AND actor_id=?').bind(assessmentId,user.id).first();
  if(request.method==='GET'){
    if(!existing)fail('Assessment not found.',404);
    return json({id:existing.id,state:existing.state,result:existing.result_json?JSON.parse(existing.result_json):null});
  }
  if(request.method!=='POST')fail('Method not supported.',405);
  const input=await body(request,3000),fileId=requireId(input.fileId),scope=user.role==='recycler'?'detailed':'broad',requestId=input.requestId||null;
  if(user.role==='collector'&&requestId!==null)fail('Collector identification uses your own draft photo.');
  let file;
  if(user.role==='recycler')file=await sharedPhoto(env,user,requireId(requestId),fileId);
  else file=await env.DB.prepare("SELECT * FROM files WHERE id=? AND owner_user_id=? AND state='ready'").bind(fileId,user.id).first();
  if(!file)fail('Photo not found.',404);
  if(existing&&(existing.file_id!==fileId||existing.request_id!==requestId))fail('This assessment reference belongs to another photo.',409);
  const saved=existing||await env.DB.prepare("SELECT * FROM account_assessments WHERE actor_id=? AND file_id=? AND scope=? AND state='ready' ORDER BY created_at DESC LIMIT 1").bind(user.id,fileId,scope).first();
  if(saved){
    if(saved.state==='ready')return json({id:saved.id,state:'ready',result:JSON.parse(saved.result_json),cached:true});
    fail(saved.state==='running'?'Assessment is still pending. You can continue manually.':'The earlier assessment failed. Continue manually or explicitly retry with a new reference.',409);
  }
  if(input.consent!==true)fail('Confirm sending this photo to Gemini for identification.');
  if(!env.ACCOUNT_BUCKET||!env.GEMINI_API_KEY||!env.GEMINI_MODEL)fail('Photo identification is unavailable. Choose the category manually.',503);
  const day=now().slice(0,10),claim=await env.DB.prepare(`INSERT INTO account_assessments(id,actor_id,file_id,request_id,scope,state,created_at)
    SELECT ?,?,?,?,?,'running',? WHERE (SELECT count(*) FROM account_assessments WHERE actor_id=? AND created_at>=?)<12
      AND (SELECT count(*) FROM account_assessments WHERE created_at>=?)<100 ON CONFLICT(id) DO NOTHING`)
    .bind(assessmentId,user.id,fileId,requestId,scope,now(),user.id,day,day).run();
  if(claim.meta.changes!==1)fail('Identification is already pending or the daily allowance is reached. Continue manually.',429);
  try{
    const object=await env.ACCOUNT_BUCKET.get(file.object_key);if(!object)fail('Photo unavailable.',503);
    const bytes=new Uint8Array(await new Response(object.body).arrayBuffer());
    const result=await assessPhoto(bytes,file.mime_type,scope,{...env,GEMINI_HEDGE_MS:0,ASSESSMENT_LANGUAGE:user.language},env.ASSESSMENT_TRANSPORT||fetch);
    await env.DB.prepare("UPDATE account_assessments SET state='ready',result_json=? WHERE id=? AND actor_id=?").bind(JSON.stringify(result),assessmentId,user.id).run();
    return json({id:assessmentId,state:'ready',result,cached:false});
  }catch(error){await env.DB.prepare("UPDATE account_assessments SET state='failed' WHERE id=? AND actor_id=?").bind(assessmentId,user.id).run();throw error;}
}
