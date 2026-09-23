import {body,fail,hash,hex,json,now} from './common.js';
import {publicUser,rate} from './auth.js';

export function staffOrigin(request){
  if(request.method!=='GET'&&request.headers.get('Origin')!==new URL(request.url).origin)fail('Open the staff portal on this server before making changes.',403);
}
export async function invitationRoute(request,env,path){
  const staff=path==='/api/ops/auth/invitation';
  if(path!=='/api/v1/auth/invitation'&&!staff)return null;
  if(env.ACCOUNTS_ENABLED!=='true'||env.INVITATIONS_ENABLED!=='true'||(staff&&env.OPS_ENABLED!=='true'))fail('Invitation sign-in is not configured.',503);
  if(request.method!=='POST')fail('Method not supported.',405);
  if(staff)staffOrigin(request);
  await rate(env,'invitation-ip:'+(request.headers.get('CF-Connecting-IP')||'unknown'),3600,30);
  const input=await body(request,1000),code=typeof input.code==='string'?input.code.trim():'';
  if(!/^ewi_[a-f0-9]{64}$/.test(code))fail('Enter your personal invitation code.',401);
  const digest=await hash(code),time=now(),invite=await env.DB.prepare('SELECT * FROM invitations WHERE token_hash=? AND expires_at>? AND revoked_at IS NULL AND redeemed_by IS NULL').bind(digest,time).first();
  if(!invite||!invite.actor.startsWith(staff?'staff:':'user:'))fail('This invitation is unavailable, expired or already used.',401);
  const uid=invite.actor.slice(invite.actor.indexOf(':')+1),table=staff?'operations_staff':'users';
  const user=await env.DB.prepare(`SELECT * FROM ${table} WHERE id=? AND status='active'`).bind(uid).first();
  if(!user)fail('This invitation is unavailable, expired or already used.',401);
  const language=input.language||user.language||'en';if(!['en','hi','mr'].includes(language))fail('Choose a supported language.');
  const token=(staff?'ewo_':'ews_')+hex(crypto.getRandomValues(new Uint8Array(32))),tokenHash=await hash(token);
  const expires=new Date(Date.now()+(staff?8*3600000:30*86400000)).toISOString();
  const writes=await env.DB.batch([
    env.DB.prepare(`UPDATE invitations SET redeemed_by=? WHERE token_hash=? AND redeemed_by IS NULL AND revoked_at IS NULL AND expires_at>? AND EXISTS(SELECT 1 FROM ${table} WHERE id=? AND status='active')`).bind(tokenHash,digest,time,uid),
    env.DB.prepare(`INSERT INTO ${staff?'staff_sessions':'sessions'}(token_hash,${staff?'staff_id':'user_id'},expires_at,created_at)
      SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM invitations WHERE token_hash=? AND redeemed_by=?)`).bind(tokenHash,uid,expires,time,digest,tokenHash),
    ...(staff?[]:[env.DB.prepare(`UPDATE users SET language=?,version=version+1,updated_at=? WHERE id=? AND EXISTS(SELECT 1 FROM invitations WHERE token_hash=? AND redeemed_by=?)`).bind(language,time,uid,digest,tokenHash)])
  ]);
  if(writes[0].meta.changes!==1||writes[1].meta.changes!==1)fail('This invitation was already used. Request a new invitation.',401);
  if(!staff)return json({token,expiresAt:expires,user:publicUser({...user,language,version:user.version+1})});
  const response=json({staff:{id:user.id,name:user.name,role:user.role},expiresAt:expires});
  response.headers.set('Set-Cookie',`__Host-ewaste_ops=${token}; Secure; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800`);return response;
}
export async function invitationStaff(request,env){
  if(env.INVITATIONS_ENABLED!=='true')return null;
  const token=request.headers.get('Cookie')?.match(/(?:^|;\s*)__Host-ewaste_ops=(ewo_[a-f0-9]{64})(?:;|$)/)?.[1];
  if(!token)return null;
  const tokenHash=await hash(token),staff=await env.DB.prepare(`SELECT s.* FROM staff_sessions t JOIN operations_staff s ON s.id=t.staff_id
    WHERE t.token_hash=? AND t.expires_at>? AND t.revoked_at IS NULL AND s.status='active'`).bind(tokenHash,now()).first();
  if(!staff)fail('Your staff session has ended. Use a new invitation.',401);
  staffOrigin(request);return {...staff,actor:'staff:'+staff.id,staff:true,tokenHash};
}
