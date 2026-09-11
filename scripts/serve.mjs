import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import worker from '../server/worker.js';
import {localBindings} from './local-backend.mjs';
const root = path.resolve('dist');
const bindings=await localBindings('work/data');
const mime = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.json':'application/json','.webmanifest':'application/manifest+json'};
http.createServer(async (req,res)=>{
  if(req.url.startsWith('/api/')){
    const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>2200000){res.writeHead(413);res.end();return;}chunks.push(chunk);}
    const request=new Request('http://127.0.0.1:5173'+req.url,{method:req.method,headers:req.headers,...(!['GET','HEAD'].includes(req.method)?{body:Buffer.concat(chunks)}:{})});
    const response=await worker.fetch(request,bindings);res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));return;
  }
  try {
    const pathname = decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    const file = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!file.startsWith(root + path.sep)||pathname.includes('/server/')||pathname.includes('/.openai/')) { res.writeHead(403); return res.end(); }
    const bytes = await readFile(file);
    res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'});res.end(bytes);
  } catch {res.writeHead(404);res.end('Not found');}
}).listen(5173,'127.0.0.1',()=>process.stdout.write('Local: http://127.0.0.1:5173\n'));
