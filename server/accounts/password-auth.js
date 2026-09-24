import {scrypt, timingSafeEqual} from 'node:crypto';
import {Buffer} from 'node:buffer';
import {authenticate,publicUser,rate} from './auth.js';
import {body,fail,hash,hex,id,json,now,text} from './common.js';

// OWASP scrypt profile: N=2^15, r=8, p=3. Store the parameters with each hash.
const SCHEME='scrypt-32768-8-3';
const derive=(password,salt)=>new Promise((resolve,reject)=>scrypt(password,salt,32,{N:32768,r:8,p:3,maxmem:40*1024*1024},(e,key)=>e?reject(e):resolve(key)));
function username(value){const name=text(value,32,'username').trim().toLowerCase();if(!/^[a-z0-9][a-z0-9._-]{3,31}$/.test(name))fail('Use 4–32 letters, numbers, dots, hyphens or underscores for your username.');return name;}
function password(value){if(typeof value!=='string'||[...value].length<15||value.length>128)fail('Use a password with 15–128 characters. A phrase of several words works well.');return value;}
function role(value){if(!['collector','recycler'].includes(value))fail('Choose Aggregator or Recycler.');return value;}
async function encoded(value){const salt=hex(crypto.getRandomValues(new Uint8Array(16)));return `${SCHEME}$${salt}$${hex(await derive(value,salt))}`;}
async function matches(value,stored){
  const [scheme,salt,digest]=stored?.split('$')||[];
  const valid=scheme===SCHEME&&/^[a-f0-9]{32}$/.test(salt)&&/^[a-f0-9]{64}$/.test(digest);
  const key=await derive(value,valid?salt:'00000000000000000000000000000000');
  return timingSafeEqual(key,Buffer.from(valid?digest:'0'.repeat(64),'hex'))&&valid;
}
function tokenData(){const token='ews_'+hex(crypto.getRandomValues(new Uint8Array(32)));return {token,expiresAt:new Date(Date.now()+30*86400000).toISOString()};}
async function limits(request,env,action,name){
  const ip=request.headers.get('CF-Connecting-IP')||'unknown';
  await rate(env,`password-${action}-ip:${ip}`,3600,action==='register'?10:60);
  await rate(env,`password-${action}-name:${name}`,3600,action==='register'?5:15);
  if(action==='register')await rate(env,'password-register-global',86400,100);
}
function usernameConflict(error){if(/UNIQUE constraint failed: auth_credentials\.(username|user_id)/.test(error.message))fail('That username is unavailable or this account already has login details.',409);throw error;}

export async function passwordRoute(request,env,path){
  if(!['/api/v1/auth/register','/api/v1/auth/login','/api/v1/auth/credentials'].includes(path))return null;
  if(env.PASSWORD_AUTH_ENABLED!=='true')fail('Username sign-in is not available on this server.',503);
  if(request.method!=='POST')fail('Method not supported.',405);
  const input=await body(request,3000),name=username(input.username),secret=password(input.password);
  const register=path.endsWith('/register'),attach=path.endsWith('/credentials');
  const owner=attach?await authenticate(request,env):null;
  if(!attach)role(input.role);
  await limits(request,env,register||attach?'register':'login',name);
  if(register||attach){
    const language=input.language||'en';if(!['en','hi','mr'].includes(language))fail('Choose a supported language.');
    const displayName=attach?owner.display_name:text(input.displayName,100,'name');
    const locality=attach?owner.locality:text(input.locality,120,'area');
    if(!attach&&(!displayName||!locality))fail('Enter your name and collection or facility area.');
    const uid=attach?owner.id:id(),time=now(),org=id(),credentials=await encoded(secret),session=tokenData(),digest=await hash(session.token);
    const statements=[];
    if(!attach)statements.push(env.DB.prepare(`INSERT INTO users(id,mobile,role,display_name,language,locality,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)`).bind(uid,'password:'+uid,input.role,displayName,language,locality,time,time));
    statements.push(env.DB.prepare('INSERT INTO auth_credentials(user_id,username,password_hash,created_at) VALUES(?,?,?,?)').bind(uid,name,credentials,time));
    if(register&&input.role==='recycler')statements.push(
      env.DB.prepare('INSERT INTO organizations(id,owner_user_id,name,created_at) VALUES(?,?,?,?)').bind(org,uid,displayName,time),
      env.DB.prepare("INSERT INTO memberships(user_id,organization_id,role) VALUES(?,?,'owner')").bind(uid,org),
      env.DB.prepare("INSERT INTO facilities(id,organization_id,name,locality,verification_status,created_at) VALUES(?,?,?,?,'unverified',?)").bind(id(),org,displayName,locality,time));
    if(register)statements.push(env.DB.prepare('INSERT INTO sessions(token_hash,user_id,expires_at,created_at) VALUES(?,?,?,?)').bind(digest,uid,session.expiresAt,time));
    statements.push(env.DB.prepare('INSERT INTO audit_events(id,actor_id,action,resource_id,resource_version,created_at) VALUES(?,?,?,?,1,?)').bind(id(),uid,attach?'credentials.created':'account.registered',uid,time));
    try{await env.DB.batch(statements);}catch(error){usernameConflict(error);}
    const user=await env.DB.prepare('SELECT * FROM users WHERE id=?').bind(uid).first();
    return json(attach?{user:publicUser({...user,username:name})}:{...session,user:publicUser({...user,username:name})},register?201:200);
  }
  const user=await env.DB.prepare('SELECT u.*,c.username,c.password_hash FROM auth_credentials c JOIN users u ON u.id=c.user_id WHERE c.username=?').bind(name).first();
  if(!await matches(secret,user?.password_hash)||!user||user.status!=='active')fail('Username or password is incorrect.',401);
  if(user.role!==input.role)fail('This account uses a different role. Go back and choose '+(user.role==='collector'?'Aggregator':'Recycler')+'.',409);
  const session=tokenData(),digest=await hash(session.token),time=now();
  const writes=await env.DB.batch([
    env.DB.prepare("INSERT INTO sessions(token_hash,user_id,expires_at,created_at) SELECT ?,id,?,? FROM users WHERE id=? AND status='active'").bind(digest,session.expiresAt,time,user.id),
    env.DB.prepare("INSERT INTO audit_events(id,actor_id,action,resource_id,resource_version,created_at) SELECT ?,?,'session.created',?,?,? WHERE changes()=1").bind(id(),user.id,user.id,user.version,time)
  ]);
  if(writes[0].meta.changes!==1)fail('Username or password is incorrect.',401);
  return json({...session,user:publicUser(user)});
}
