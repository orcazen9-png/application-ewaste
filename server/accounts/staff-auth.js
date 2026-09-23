import {fail} from './common.js';
import {invitationStaff} from './invitations.js';

const certificates=new Map();
function decode(value){return Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));}
// The assertion is verified even when an alternate Worker hostname bypasses Access.
export async function authenticateStaff(request,env){
  if(env.ACCOUNTS_ENABLED!=='true'||env.OPS_ENABLED!=='true')fail('Operations access is not configured.',503);
  const invited=await invitationStaff(request,env);if(invited)return invited;
  if(env.INVITATIONS_ENABLED==='true'&&!env.OPS_ACCESS_ISSUER)fail('Sign in with your personal staff invitation.',401);
  const issuer=env.OPS_ACCESS_ISSUER,audience=env.OPS_ACCESS_AUD;
  if(env.ACCOUNTS_ENABLED!=='true'||env.OPS_ENABLED!=='true'||!/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(issuer||'')||!audience)fail('Operations access is not configured.',503);
  const token=request.headers.get('Cf-Access-Jwt-Assertion')||'';
  if(token.length>12000||token.split('.').length!==3)fail('Sign in through Freedom Value staff access.',401);
  let header,payload,signature;const [head,body,sig]=token.split('.');
  try{header=JSON.parse(new TextDecoder().decode(decode(head)));payload=JSON.parse(new TextDecoder().decode(decode(body)));signature=decode(sig);}catch{fail('Invalid staff identity.',401);}
  const seconds=Math.floor(Date.now()/1000);
  if(header.alg!=='RS256'||typeof header.kid!=='string'||header.crit||payload.iss!==issuer||!Array.isArray(payload.aud)||!payload.aud.includes(audience)||!Number.isFinite(payload.exp)||payload.exp<=seconds||!Number.isFinite(payload.iat)||payload.iat>seconds+30||(payload.nbf!==undefined&&(!Number.isFinite(payload.nbf)||payload.nbf>seconds+30))||typeof payload.sub!=='string'||!payload.sub||typeof payload.email!=='string')fail('Staff identity expired or is invalid for this application.',401);
  let cached=certificates.get(issuer);
  if(!cached||cached.until<Date.now()){
    let response;try{response=await (env.ACCESS_CERT_TRANSPORT||fetch)(issuer+'/cdn-cgi/access/certs',{signal:AbortSignal.timeout(5000),redirect:'error'});}catch{fail('Staff identity verification is unavailable.',503);}
    if(!response.ok)fail('Staff identity verification is unavailable.',503);
    const jwks=await response.json();if(!Array.isArray(jwks.keys))fail('Staff identity verification is unavailable.',503);
    cached={keys:jwks.keys,until:Date.now()+60000};certificates.set(issuer,cached);
  }
  const key=cached.keys.find(k=>k.kid===header.kid&&k.kty==='RSA'&&(!k.alg||k.alg==='RS256')&&(!k.use||k.use==='sig'));
  let valid=false;try{if(key)valid=await crypto.subtle.verify('RSASSA-PKCS1-v1_5',await crypto.subtle.importKey('jwk',key,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']),signature,new TextEncoder().encode(head+'.'+body));}catch{}
  if(!valid)fail('Invalid staff signature. Sign in again.',401);
  const staff=await env.DB.prepare("SELECT * FROM operations_staff WHERE subject=? AND status='active'").bind(payload.sub).first();
  if(!staff||staff.email.toLowerCase()!==payload.email.toLowerCase())fail('This identity has no active staff invitation.',403);
  if(request.method!=='GET'&&request.headers.get('Origin')!==new URL(request.url).origin)fail('Open the staff portal on this server before making changes.',403);
  return {...staff,actor:'staff:'+staff.id,staff:true};
}
