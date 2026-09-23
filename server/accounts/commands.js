import {body,canonical,fail,hash,json,now,requireId} from './common.js';
const parse=JSON.parse;
const stmt=(env,sql,...args)=>env.DB.prepare(sql).bind(...args);
export async function begin(request,env,user){
  const input=await body(request);requireId(input.commandId);
  if(!Number.isSafeInteger(input.expectedVersion)||input.expectedVersion<0)fail('Refresh this record before making changes.');
  const digest=await hash(canonical({path:new URL(request.url).pathname,input,method:request.method}));
  const replay=async()=>{const r=await stmt(env,'SELECT * FROM logistics_commands WHERE actor=? AND command_id=?',user.actor,input.commandId).first();if(!r)return null;if(r.payload_hash!==digest)fail('This action differs from the saved retry.',409);return json({...parse(r.result_json),replayed:true});};
  return {input,digest,replay,previous:await replay(),user};
}
export async function commit(env,c,first,result,extras=[]){
  const guard='EXISTS(SELECT 1 FROM logistics_commands WHERE actor=? AND command_id=?)',args=[c.user.actor,c.input.commandId];
  let writes;try{writes=await env.DB.batch([first,stmt(env,`INSERT INTO logistics_commands(actor,command_id,payload_hash,result_json,created_at) SELECT ?,?,?,?,? WHERE changes()=1`,...args,c.digest,JSON.stringify(result),now()),...extras.map(make=>make(guard,args))]);}
  catch(error){const replay=await c.replay();if(replay)return replay;if(/MARKET_CONFLICT:/.test(error.message))fail('The order or physical custody changed. Refresh before continuing.',409);throw error;}
  if(writes[0].meta.changes!==1){const replay=await c.replay();if(replay)return replay;fail('This record changed. Refresh and review your action.',409);}return json({...result,replayed:false});
}
