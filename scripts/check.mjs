import {readdir,readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
const files=await readdir('dist');
for(const file of files.filter(f=>f.endsWith('.js'))){const result=spawnSync(process.execPath,['--check',`dist/${file}`],{encoding:'utf8'});if(result.status!==0){process.stderr.write(result.stderr||result.error?.message||`Check failed: ${file}`);process.exit(1);}}
const html=await readFile('dist/index.html','utf8');
for(const [,ref]of html.matchAll(/(?:src|href)="\.\/([^"#]+)"/g))await readFile('dist/'+ref);
JSON.parse(await readFile('dist/manifest.webmanifest','utf8'));
console.log(`Checked ${files.filter(f=>f.endsWith('.js')).length} JavaScript modules, entry assets, and manifest.`);
