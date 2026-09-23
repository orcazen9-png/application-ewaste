import assert from 'node:assert/strict';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import worker from '../../server/worker.js';
import {localBindings} from '../../scripts/local-backend.mjs';
import {hash} from '../../server/accounts/common.js';
import {CATALOG} from '../../dist/waste-catalog.js';
const id=()=>crypto.randomUUID(),future=()=>new Date(Date.now()+30*86400000).toISOString();
export async function fixture(t){
  const env=await localBindings(await mkdtemp(path.join(tmpdir(),'ewaste-market-')));t.after(()=>env.close());env.ACCOUNTS_ENABLED='true';
  async function user(role='collector',verified=true){
    const uid=id(),token='ews_'+id().replaceAll('-','')+id().replaceAll('-',''),org=id(),facility=id();
    await env.DB.prepare("INSERT INTO users(id,mobile,role,display_name,locality,created_at,updated_at) VALUES(?,?,?,'Test account','Mumbai',?,?)").bind(uid,id(),role,new Date().toISOString(),new Date().toISOString()).run();
    await env.DB.prepare('INSERT INTO sessions VALUES(?,?,?,NULL,?)').bind(await hash(token),uid,future(),new Date().toISOString()).run();
    if(role==='recycler')await env.DB.batch([
      env.DB.prepare("INSERT INTO organizations(id,owner_user_id,name,created_at) VALUES(?,?,'Test recycler',?)").bind(org,uid,new Date().toISOString()),
      env.DB.prepare("INSERT INTO facilities(id,organization_id,name,locality,verification_status,created_at) VALUES(?,?,'Test facility','Mumbai',?,?)").bind(facility,org,verified?'verified':'unverified',new Date().toISOString())]);
    return {id:uid,token,facility};
  }
  const call=(u,url,method='GET',input)=>worker.fetch(new Request('https://test.example/api/v1'+url,{method,headers:{Authorization:'Bearer '+u.token,'Content-Type':'application/json'},...(method==='GET'?{}:{body:JSON.stringify(input||{})})}),env);
  async function ok(u,url,method='GET',input,status=200){const r=await call(u,url,method,input),data=await r.json();assert.equal(r.status,status,JSON.stringify(data));return data;}
  async function lot(u,extra={}){const lotId=id(),itemId=id(),input={commandId:id(),expectedVersion:0,taxonomyVersion:CATALOG.version,title:'Computer lot',locality:'Mumbai',notes:'Private notes',fileIds:[],items:[{id:itemId,broadCode:'B01',detailedCode:null,description:'Used computers',condition:'sorted',unit:'kg',quantity:'500',reviewState:'confirmed'}],...extra};await ok(u,'/lots/'+lotId,'PUT',input,201);return {id:lotId,itemId,input};}
  async function requirement(u,extra={}){const rid=id(),input={commandId:id(),expectedVersion:0,broadCode:'B01',detailedCode:null,title:'Used computers wanted',specification:'Sorted units',unit:'kg',rate:'50.00',minimum:'10',target:'500',areas:['Mumbai'],modes:['pickup','dropoff'],validUntil:future(),state:'active',...extra};await ok(u,'/requirements/'+rid,'PUT',input);return {id:rid,input};}
  async function request(c,lot,r,extra={}){const rid=id(),input={commandId:id(),lotId:lot.id,itemId:lot.itemId,lotVersion:1,requirementId:r.id,requirementVersion:1,quantity:'200',mode:'pickup',ask:'',sharePhotos:true,...extra};await ok(c,'/requests/'+rid,'POST',input);return {id:rid,input};}
  return {env,user,call,ok,lot,requirement,request};
}
