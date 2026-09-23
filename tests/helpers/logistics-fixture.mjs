import assert from 'node:assert/strict';
import {fixture} from './market-fixture.mjs';
import worker from '../../server/worker.js';
const id=()=>crypto.randomUUID(),time=()=>new Date().toISOString();
const enc=value=>Buffer.from(typeof value==='string'?value:JSON.stringify(value)).toString('base64url');
export async function setup(t){
  const f=await fixture(t),c=await f.user(),r=await f.user('recycler'),lot=await f.lot(c),req=await f.requirement(r),request=await f.request(c,lot,req),accepted=await f.ok(r,'/requests/'+request.id+'/accept','POST',{commandId:id(),expectedVersion:1});
  const order=accepted.id,staff=id();f.env.OPS_ENABLED='true';f.env.OPS_ACCESS_ISSUER='https://test-'+id()+'.cloudflareaccess.com';f.env.OPS_ACCESS_AUD='test-operations';
  const keys=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',hash:'SHA-256',modulusLength:2048,publicExponent:new Uint8Array([1,0,1])},true,['sign','verify']);
  const jwk=await crypto.subtle.exportKey('jwk',keys.publicKey);jwk.kid='test';
  f.env.ACCESS_CERT_TRANSPORT=async()=>new Response(JSON.stringify({keys:[jwk]}));
  await f.env.DB.prepare("INSERT INTO operations_staff VALUES(?,?,?,'Ops','operations','active',?)").bind(staff,'staff-subject','ops@example.test',time()).run();
  const sign=async extra=>{const head=enc({alg:'RS256',kid:'test'}),claims=enc({iss:f.env.OPS_ACCESS_ISSUER,aud:['test-operations'],sub:'staff-subject',email:'ops@example.test',iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+3600,...extra}),signature=await crypto.subtle.sign('RSASSA-PKCS1-v1_5',keys.privateKey,Buffer.from(head+'.'+claims));return head+'.'+claims+'.'+Buffer.from(signature).toString('base64url');};
  const token=await sign({});
  const ops=(path,method='GET',input,headers={})=>worker.fetch(new Request('https://test.example/api/ops'+path,{method,headers:{'Cf-Access-Jwt-Assertion':token,Origin:'https://test.example','Content-Type':'application/json',...headers},...(method==='GET'?{}:{body:JSON.stringify(input)})}),f.env);
  const okOps=async(path,method='GET',input)=>{const res=await ops(path,method,input),data=await res.json();assert.equal(res.status,200,JSON.stringify(data));return data;};
  const read=()=>f.ok(c,'/orders/'+order+'/logistics');
  const act=async(actor,kind,input={})=>{const v=(await read()).order.version,payload={commandId:id(),expectedVersion:v,...input};return actor==='ops'?okOps('/orders/'+order+'/'+kind,'POST',payload):f.ok(actor,'/orders/'+order+'/logistics/'+kind,'POST',payload);};
  const partner=id(),p={commandId:id(),expectedVersion:0,name:'Local transport',contact:'Dispatch desk',areas:['Mumbai'],status:'active'};await okOps('/partners/'+partner,'PUT',p);
  const schedule=()=>act('ops','schedule',{partnerId:partner,start:new Date(Date.now()+3600000).toISOString(),end:new Date(Date.now()+7200000).toISOString(),instructions:'Loading bay',message:'Agreed window'});
  const cost=()=>act('ops','cost',{amount:'1000',basis:'estimate',payee:'Local transport',source:'Partner written quote',message:'Initial quote'});
  const ready=async()=>{await schedule();await cost();await act(r,'acknowledge-cost',{costVersion:1});};
  const evidence=(quantity,extra={})=>({quantity,capturedAt:time(),location:'Mumbai loading bay',locationSource:'manual',condition:'Sorted',message:'Scale reading checked',fileIds:[],noPhotoReason:'Camera unavailable; written weighbridge record checked',...extra});
  return {...f,c,r,order,req,sourceLot:lot,staff,partner,p,ops,okOps,sign,read,act,schedule,cost,ready,evidence};
}
