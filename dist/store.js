import {createState} from './domain.js';
const DATABASE='ewaste-marketplace-v1';
let connection;
async function db(){if(connection)return connection;connection=await new Promise((resolve,reject)=>{const request=indexedDB.open(DATABASE,1);request.onupgradeneeded=()=>{request.result.createObjectStore('records');request.result.createObjectStore('photos');};request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});return connection;}
export async function readState(){const database=await db();return new Promise((resolve,reject)=>{const tx=database.transaction('records','readonly');const req=tx.objectStore('records').get('state');req.onsuccess=()=>resolve(req.result||null);req.onerror=()=>reject(req.error);});}
export async function changeState(mutator,{photo}={}){
  const database=await db();return new Promise((resolve,reject)=>{
    const tx=database.transaction(['records','photos'],'readwrite');const store=tx.objectStore('records');let state,result;
    const req=store.get('state');req.onsuccess=()=>{try{state=req.result||createState();if(state.schemaVersion!==1)throw new Error('Unsupported data version.');result=mutator(state);state.revision++;store.put(state,'state');if(photo)tx.objectStore('photos').put(photo.blob,photo.id);}catch(error){reject(error);tx.abort();}};
    tx.oncomplete=()=>{window.dispatchEvent(new CustomEvent('ewaste:saved'));resolve({state,result});};tx.onerror=()=>reject(tx.error||new Error('Unable to save. Your device may be out of storage.'));tx.onabort=()=>reject(tx.error||new Error('Save was interrupted. Please retry.'));
  });
}
export async function getPhoto(id){if(!id)return null;const database=await db();return new Promise((resolve,reject)=>{const req=database.transaction('photos','readonly').objectStore('photos').get(id);req.onsuccess=()=>resolve(req.result||null);req.onerror=()=>reject(req.error);});}
export async function compressPhoto(file){
  if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw new Error('Choose a JPG, PNG, or WebP photo.');
  if(file.size>15*1024*1024)throw new Error('Choose a photo smaller than 15 MB.');
  const bitmap=await createImageBitmap(file);const scale=Math.min(1,1440/Math.max(bitmap.width,bitmap.height));
  const canvas=document.createElement('canvas');canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.8));if(!blob)throw new Error('This photo could not be prepared. Try another photo.');return blob;
}
