// Trusted operator CLI. No public bootstrap endpoint, shared OTP or embedded key.
// Generates a private invitation file and executes only hashed tokens in D1.
import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
const args=Object.fromEntries(process.argv.slice(2).map(a=>{const i=a.indexOf('=');return [a.slice(0,i),a.slice(i+1)];}));
const role=args.role,name=args.name,existing=args.actor;
if(!['collector','recycler','operations','finance','operations_finance','viewer'].includes(role)||!name||name.length>100)throw new Error('Use role=collector|recycler|operations|finance|operations_finance|viewer name=Person locality=Area. Optional actor=user:UUID or staff:UUID reissues and revokes old sessions.');
const personal=['collector','recycler'].includes(role),uid=existing?.split(':')[1]||randomUUID(),actor=(personal?'user:':'staff:')+uid;
if(existing&&(existing!==actor||!/^[a-f0-9-]{36}$/.test(uid)))throw new Error('Invalid existing actor.');
const quote=v=>"'"+String(v).replaceAll("'","''")+"'",time=new Date().toISOString(),expiry=new Date(Date.now()+7*86400000).toISOString(),code='ewi_'+randomBytes(32).toString('hex'),digest=createHash('sha256').update(code).digest('hex');
const sql=[];
if(!existing){
  if(personal){sql.push(`INSERT INTO users(id,mobile,role,display_name,locality,created_at,updated_at) VALUES(${quote(uid)},${quote('invited:'+uid)},${quote(role)},${quote(name)},${quote(args.locality||'')},${quote(time)},${quote(time)});`);
    if(role==='recycler'){const org=randomUUID();sql.push(`INSERT INTO organizations(id,owner_user_id,name,created_at) VALUES(${quote(org)},${quote(uid)},${quote(name)},${quote(time)});`,`INSERT INTO memberships VALUES(${quote(uid)},${quote(org)},'owner');`,`INSERT INTO facilities(id,organization_id,name,locality,created_at) VALUES(${quote(randomUUID())},${quote(org)},${quote(name)},${quote(args.locality||'')},${quote(time)});`);}
  }else sql.push(`INSERT INTO operations_staff(id,subject,email,name,role,status,created_at) VALUES(${quote(uid)},${quote('invite:'+uid)},${quote('invitation+'+uid+'@local.invalid')},${quote(name)},${quote(role)},'active',${quote(time)});`);
}else {
  sql.push(`UPDATE invitations SET revoked_at=${quote(time)} WHERE actor=${quote(actor)} AND revoked_at IS NULL;`,`UPDATE ${personal?'sessions':'staff_sessions'} SET revoked_at=${quote(time)} WHERE ${personal?'user_id':'staff_id'}=${quote(uid)} AND revoked_at IS NULL;`);
}
sql.push(`INSERT INTO invitations(token_hash,actor,expires_at,created_at) SELECT ${quote(digest)},${quote(actor)},${quote(expiry)},${quote(time)} WHERE EXISTS(SELECT 1 FROM ${personal?'users':'operations_staff'} WHERE id=${quote(uid)} AND role=${quote(role)} AND status='active');`);
await mkdir('work/invitations',{recursive:true});const base=path.resolve('work/invitations/'+uid),sqlFile=base+'.sql';await writeFile(sqlFile,sql.join('\n'),{mode:0o600});
const result=spawnSync(process.execPath,['node_modules/wrangler/bin/wrangler.js','d1','execute','ewaste-accounts-demo','--remote','--config','wrangler.accounts.toml','--file',sqlFile],{encoding:'utf8'});
if(result.status!==0){process.stderr.write(result.stderr||result.stdout);process.exit(1);}
await writeFile(base+'.json',JSON.stringify({name,role,actor,code,expiresAt:expiry,signIn:personal?'Android app':'https://ewaste-accounts-demo.ewaste-marketplace.workers.dev/operations.html'},null,2)+'\n',{mode:0o600});
console.log('Invitation saved privately: '+base+'.json');console.log('Actor: '+actor+'; expires '+expiry+'. Keep this file out of GitHub and public downloads.');
