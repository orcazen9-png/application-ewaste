import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFile} from 'node:fs/promises';
import {unstable_splitSqlQuery} from 'wrangler';
test('every migration is executable after the actual Wrangler statement splitter',async()=>{
  const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');
  try{const journal=JSON.parse(await readFile('drizzle/meta/_journal.json','utf8'));let previous=0;
    for(const e of journal.entries){assert.ok(e.when>previous);previous=e.when;const sql=await readFile('drizzle/'+e.tag+'.sql','utf8');db.exec('BEGIN');try{for(const statement of unstable_splitSqlQuery(sql))db.exec(statement);db.exec('COMMIT');}catch(error){db.exec('ROLLBACK');throw new Error(e.tag+': '+error.message);}}
    assert.equal(db.prepare("SELECT count(*) AS n FROM sqlite_master WHERE type='trigger'").get().n,13);
  }finally{db.close();}
});
