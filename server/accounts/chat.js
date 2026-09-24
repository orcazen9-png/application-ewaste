import {fail,hash,id,json,now,requireId,rows,text} from './common.js';
import {begin,commit} from './commands.js';
import {postedLot} from './discovery.js';
import {projectRequest} from './marketplace.js';
const stmt=(env,sql,...args)=>env.DB.prepare(sql).bind(...args);
const select=`SELECT c.*,l.title AS lotTitle,l.locality,u.display_name AS collectorName,r.display_name AS recyclerName FROM conversations c JOIN lots l ON l.id=c.lot_id JOIN users u ON u.id=c.collector_id JOIN users r ON r.id=c.recycler_id`;
async function permitted(env,user,record){const row=await stmt(env,select+' WHERE c.id=? AND (c.collector_id=? OR c.recycler_id=?)',requireId(record),user.id,user.id).first();if(!row)fail('Conversation not found.',404);return row;}
export async function chatRoute(request,env,user,path){
 const route=path.match(/^\/api\/v1\/conversations(?:\/([^/]+))?(?:\/(messages))?$/);if(!route)return null;
 const record=route[1],action=route[2],q=new URL(request.url).searchParams;
 if(request.method==='GET'){
  if(!record){const page=Number(q.get('page')||0);if(!Number.isInteger(page)||page<0||page>200)fail('Invalid conversation page.');const list=await rows(stmt(env,select+' WHERE c.collector_id=? OR c.recycler_id=? ORDER BY c.updated_at DESC,c.id LIMIT 51 OFFSET ?',user.id,user.id,page*50));return json({conversations:list.slice(0,50),nextPage:list.length>50?page+1:null});}
  const conversation=await permitted(env,user,record),before=q.get('before')||'';if(before&&!/^\d{4}-.*Z\|[a-f0-9-]{36}$/.test(before))fail('Invalid message cursor.');
  const messages=await rows(stmt(env,`SELECT * FROM (SELECT id,sender_id AS actorId,'message' AS kind,message,created_at AS createdAt FROM chat_messages WHERE conversation_id=? UNION ALL SELECT e.id,e.actor_id AS actorId,e.kind,e.message,e.created_at AS createdAt FROM market_events e JOIN supply_requests s ON s.id=e.request_id WHERE s.lot_id=? AND s.recycler_id=? AND s.collector_id=? AND e.kind IN ('message','clarification')) WHERE (?='' OR createdAt||'|'||id<?) ORDER BY createdAt DESC,id DESC LIMIT 51`,record,conversation.lot_id,conversation.recycler_id,conversation.collector_id,before,before));
  const offers=await rows(stmt(env,'SELECT * FROM supply_requests WHERE lot_id=? AND collector_id=? AND recycler_id=? ORDER BY updated_at DESC,id DESC LIMIT 50',conversation.lot_id,conversation.collector_id,conversation.recycler_id));
  const page=messages.slice(0,50);return json({conversation,messages:page.reverse(),offers:offers.map(projectRequest),olderCursor:messages.length>50?messages[49].createdAt+'|'+messages[49].id:null});
 }
 if(request.method!=='POST')fail('Method not supported.',405);
 const c=await begin(request,env,{...user,actor:'user:'+user.id});if(c.previous)return c.previous;
 if(!record){
  const lotId=requireId(c.input.lotId),lot=await stmt(env,'SELECT * FROM lots WHERE id=?',lotId).first();if(!lot)fail('Lot not found.',404);
  const recyclerId=user.role==='recycler'?user.id:requireId(c.input.recyclerId),recycler=await stmt(env,"SELECT id FROM users WHERE id=? AND role='recycler' AND status='active'",recyclerId).first();if(!recycler)fail('Recycler not found.',404);
  if(user.role==='collector'&&lot.owner_user_id!==user.id)fail('Lot not found.',404);
  if(user.role!=='collector'&&user.role!=='recycler')fail('Access denied.',403);
  const prior=await stmt(env,'SELECT 1 FROM supply_requests WHERE lot_id=? AND recycler_id=?',lotId,recyclerId).first();
  if(user.role==='recycler'&&!prior&&!await postedLot(env,lotId))fail('Posted lot not found.',404);
  if(!prior&&await stmt(env,'SELECT 1 FROM lot_deletions WHERE lot_id=?',lotId).first())fail('This lot was deleted.',410);
  const digest=await hash('conversation:'+lotId+':'+recyclerId),cid=[digest.slice(0,8),digest.slice(8,12),digest.slice(12,16),digest.slice(16,20),digest.slice(20,32)].join('-'),time=now();
  return commit(env,c,stmt(env,`INSERT INTO conversations VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET updated_at=conversations.updated_at`,cid,lotId,lot.owner_user_id,recyclerId,time,time),{id:cid});
 }
 if(action!=='messages')fail('Not found.',404);const conversation=await permitted(env,user,record),message=text(c.input.message,2000,'message');if(!message)fail('Enter a message.');
 const receiver=conversation.collector_id===user.id?conversation.recycler_id:conversation.collector_id;
 if(!await stmt(env,"SELECT 1 FROM users WHERE id=? AND status='active'",receiver).first())fail('This account is no longer available.',409);
 const count=await stmt(env,'SELECT count(*) n FROM chat_messages WHERE sender_id=? AND created_at>?',user.id,new Date(Date.now()-3600000).toISOString()).first();if(count.n>=120)fail('Too many messages. Try again later.',429);
 const time=now();return commit(env,c,stmt(env,'INSERT INTO chat_messages VALUES(?,?,?,?,?)',id(),record,user.id,message,time),{id:record},[
  (g,a)=>stmt(env,`UPDATE conversations SET updated_at=? WHERE id=? AND ${g}`,time,record,...a),
  (g,a)=>stmt(env,`INSERT INTO notifications(id,user_id,kind,title,body,resource_id,created_at) SELECT ?,?,'chat.message','New message','Open your conversation',?,? WHERE ${g}`,id(),receiver,record,time,...a)
 ]);
}
