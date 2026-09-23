import {DatabaseSync} from 'node:sqlite';
import {mkdir,readFile,writeFile,stat} from 'node:fs/promises';
import path from 'node:path';
export async function localBindings(directory){
  await mkdir(directory,{recursive:true});const database=new DatabaseSync(path.join(directory,'workspace.sqlite'));
  database.exec('PRAGMA foreign_keys=ON');
  const journal=JSON.parse(await readFile('drizzle/meta/_journal.json','utf8'));
  database.exec('CREATE TABLE IF NOT EXISTS local_migrations (name TEXT PRIMARY KEY)');
  for(const entry of journal.entries){if(!database.prepare('SELECT name FROM local_migrations WHERE name=?').get(entry.tag)){database.exec('BEGIN');try{database.exec(await readFile(`drizzle/${entry.tag}.sql`,'utf8'));database.prepare('INSERT INTO local_migrations VALUES (?)').run(entry.tag);database.exec('COMMIT');}catch(e){database.exec('ROLLBACK');throw e;}}}
  const prepare=sql=>{let args=[];return {bind(...values){args=values;return this;},async first(){return database.prepare(sql).get(...args)||null;},async all(){return {results:database.prepare(sql).all(...args)};},run(){const result=database.prepare(sql).run(...args);return {meta:{changes:Number(result.changes)}};}};};
  const DB={prepare,async batch(statements){database.exec('BEGIN IMMEDIATE');try{const results=statements.map(stmt=>stmt.run());database.exec('COMMIT');return results;}catch(error){database.exec('ROLLBACK');throw error;}}};
  const BUCKET={async put(key,bytes,options){const file=path.join(directory,'photos',key);await mkdir(path.dirname(file),{recursive:true});await writeFile(file,bytes);await writeFile(file+'.json',JSON.stringify(options.httpMetadata));},async head(key){try{return await stat(path.join(directory,'photos',key));}catch{return null;}},async get(key){try{return {body:await readFile(path.join(directory,'photos',key)),httpMetadata:JSON.parse(await readFile(path.join(directory,'photos',key)+'.json','utf8'))};}catch{return null;}}};
  return {DB,BUCKET,ACCOUNT_BUCKET:BUCKET,LOCAL_DEMO:true,close:()=>database.close()};
}
