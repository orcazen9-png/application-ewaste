import {build} from 'esbuild';
import {readdir,readFile,mkdir,writeFile,cp} from 'node:fs/promises';
const files=(await readdir('dist')).filter(f=>/\.(js|css|html|svg|webmanifest)$/.test(f));
await mkdir('dist/client',{recursive:true});
const assets={};
for(const file of files){assets['/'+file]=await readFile('dist/'+file,'utf8');await cp('dist/'+file,'dist/client/'+file);}
const entry=`import worker from './server/worker.js';const assets=${JSON.stringify(assets)};const types={js:'text/javascript',html:'text/html',css:'text/css',svg:'image/svg+xml',webmanifest:'application/manifest+json'};export default {fetch(request,env){return worker.fetch(request,{...env,APP_ASSETS:async request=>{const path=new URL(request.url).pathname;const key=path==='/'?'/index.html':path;return assets[key]===undefined?new Response('Not found',{status:404}):new Response(assets[key],{headers:{'Content-Type':types[key.split('.').pop()]+'; charset=utf-8','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'}});}})}};`;
await build({stdin:{contents:entry,resolveDir:process.cwd(),sourcefile:'worker-entry.js'},bundle:true,format:'esm',platform:'browser',target:'es2022',outfile:'dist/server/index.js'});
await mkdir('dist/.openai',{recursive:true});await cp('.openai/hosting.json','dist/.openai/hosting.json');await cp('drizzle','dist/.openai/drizzle',{recursive:true});
console.log(`Built web, Android assets, and Worker (${files.length} client files).`);
