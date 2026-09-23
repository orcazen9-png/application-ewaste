// A phone opening this page over plain Wi-Fi http has no crypto.randomUUID (it needs a secure
// context). getRandomValues is still available, so build the same random v4 ID from it.
if(!crypto.randomUUID)crypto.randomUUID=()=>'10000000-1000-4000-8000-100000000000'.replace(/[018]/g,c=>(c^crypto.getRandomValues(new Uint8Array(1))[0]&15>>c/4).toString(16));
import {readState,compressPhoto} from './store.js';
import {connectWorkspace} from './sync.js';
import {choices} from './waste-catalog.js';
let config,items=[],role='aggregator',busy=false,urls=[];
const content=document.querySelector('#content'),message=document.querySelector('#message');
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=p=>new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR'}).format(p/100);
const label=(scope,code)=>choices(scope).find(c=>c.code===code)?.name||'Awaiting confirmation';
async function api(path,body,method='POST'){
  if(!config?.code)throw new Error('Connect the demo workspace first.');
  const response=await fetch(config.endpoint+'/api/identification'+path,{method,headers:{Authorization:`Bearer ${config.code}`,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(90000)});
  const data=await response.json();if(!response.ok)throw new Error(data.error||'Request failed.');return data;
}
async function refresh(){const state=await readState();config=state?.sync;if(!config?.code){message.textContent='Connect a workspace to begin.';return;}const data=await api('',null,'GET');items=data.items;document.querySelector('#connection').hidden=true;message.textContent=data.configured?'Connected. Choose a workflow below.':'Backend connection works. Gemini API key and model still need configuration.';render();}
// Codes that a photo alone cannot separate; shown every time, whatever the model says.
const SPEC_CHECKS={
 ITEW3:'Laptop, notebook and notepad codes overlap. Check the model plate or specification before confirming.',
 ITEW4:'Laptop, notebook and notepad codes overlap. Check the model plate or specification before confirming.',
 ITEW5:'Laptop, notebook and notepad codes overlap. Pen/slate devices only by default; confirm the form and use.',
 ITEW15:'Phone, phablet and tablet codes overlap and there is no screen-size rule yet. Check the model before confirming.',
 ITEW19:'Phone, phablet and tablet codes overlap and there is no screen-size rule yet. Check the model before confirming.',
 ITEW20:'Phone, phablet and tablet codes overlap and there is no screen-size rule yet. Check the model before confirming.',
 ITEW17:'Telecom and audio/video codes overlap. Confirm the intended function.',CEEW13:'Telecom and audio/video codes overlap. Confirm the intended function.',
 CEEW6:'Display codes overlap (CEEW6 / LSEEW34). Appearance cannot decide; check the specification.',LSEEW34:'Display codes overlap (CEEW6 / LSEEW34). Appearance cannot decide; check the specification.',
 LSEEW19:'Sewing equipment overlaps EETW3. Confirm from specification or context.',EETW3:'Sewing equipment overlaps LSEEW19. Confirm from specification or context.',
 MDW10:'Needs documented medical use. Ordinary phones and tablets do not belong here.',LIW2:'Very broad wording. Do not use as a catch-all for electronics.'
};
const codesOf=decision=>decision?(decision.codes||(decision.code?[decision.code]:[])):[];
function assessment(item,scope){
 const a=item.assessments.filter(a=>a.scope===scope).at(-1),d=item.decisions.filter(d=>d.scope===scope).at(-1);
 const suggested=(a?.items||[]).map(i=>i.code),confirmed=codesOf(d);
 const ticked=new Set(confirmed.length?confirmed:suggested);
 const listed=[...new Set([...suggested,...confirmed])];
 const found=a?(a.items?.length?`<ul class="found">${a.items.map(i=>`<li><strong>${esc(i.code)} · ${esc(label(scope,i.code))}</strong>${i.approximateCount?` · about ${i.approximateCount} visible`:''}<br><span class="small">${esc(i.evidence)}</span>${SPEC_CHECKS[i.code]?`<br><span class="small spec-check">⚠ ${esc(SPEC_CHECKS[i.code])}</span>`:''}</li>`).join('')}</ul>`:`<p><strong>${esc(a.status.replaceAll('_',' '))}</strong> — no category assigned.</p>`):'';
 return `<h3>${scope==='broad'?'Broad categories (aggregator)':'Detailed equipment codes (recycler)'}</h3>${a?`<p class="small muted">Result: ${esc(a.status.replaceAll('_',' '))}</p>${found}<p>${esc(a.description)}</p><p><b>Uncertainty:</b> ${esc(a.uncertainty)||'None stated; human confirmation still required.'}</p>${a.nextPhoto?`<p><b>More information needed:</b> ${esc(a.nextPhoto)}</p>`:''}<p class="small muted">Gemini · ${esc(a.model)} · ${esc(a.createdAt)}${a.latencyMs?` · took ${(a.latencyMs/1000).toFixed(1)}s`:''}</p>`:'<p>No assessment yet.</p>'}${d?`<p><b>Confirmed by person:</b> ${d.outcome==='not_ewaste'?'Not e-waste':d.outcome==='retake_photo'?'Needs a better photo':esc(codesOf(d).map(c=>c+' · '+label(scope,c)).join(' | '))} <span class="small muted">(${esc(d.method)})</span></p>`:''}${role!=='erp'?`<button class="btn secondary" data-assess="${item.id}" data-scope="${scope}">${a?'Use saved assessment':'Assess photo with Gemini'}</button>${a?`<fieldset class="picks" id="picks-${scope}-${item.id}"><legend>Confirm, untick or add categories</legend>${listed.map(c=>`<label class="pick"><input type="checkbox" value="${esc(c)}" ${ticked.has(c)?'checked':''}> ${esc(c+' · '+label(scope,c))}</label>`).join('')||'<p class="small">Nothing suggested. Add the correct category below.</p>'}</fieldset><label>Add another category<select data-add="picks-${scope}-${item.id}"><option value="">Choose a category to add</option>${choices(scope).map(c=>`<option value="${esc(c.code)}">${esc(c.code+' · '+c.name)}</option>`).join('')}</select></label><button class="btn" data-confirm="${item.id}" data-scope="${scope}" data-assessment="${a.id}">Save confirmed categories</button><button class="btn secondary" data-confirm="${item.id}" data-scope="${scope}" data-assessment="${a.id}" data-outcome="not_ewaste">Not e-waste</button><button class="btn secondary" data-confirm="${item.id}" data-scope="${scope}" data-assessment="${a.id}" data-outcome="retake_photo">Needs a better photo</button>`:''}`:''}`;
}
function render(){
 urls.forEach(URL.revokeObjectURL);urls=[];
 content.innerHTML=(role==='aggregator'?`<form id="upload" class="card"><h2>Submit equipment</h2><p>The photo is stored in this workspace and, when you save, sent to Google Gemini to suggest categories. Gemini never sets prices; a person confirms every category.</p><label>Photo<input name="photo" type="file" accept="image/jpeg,image/png,image/webp" required></label><label>Description<textarea name="description" maxlength="500"></textarea></label><div class="columns"><label>Quantity / weight<input name="quantity" type="number" min="0.001" max="100000" step="0.001" value="1" required></label><label>Price basis<select name="basis"><option value="item">Per item</option><option value="kg">Per kilogram</option><option value="lot">Per lot</option></select></label><label>Asking price (₹ per selected unit)<input name="price" type="number" min="0.01" max="10000000" step="0.01" required></label></div><button class="btn">Save submission</button></form>`:'')+(role==='erp'?`<h2>ERP overview</h2><p>${items.length} submissions · ${items.reduce((n,i)=>n+i.assessments.length,0)} assessments · ${items.reduce((n,i)=>n+i.offers.length,0)} offers. Asking prices and offers are not completed payments.</p>`:'')+items.map(i=>`<article class="card"><div class="columns"><div><img class="photo" data-photo="${i.photoId}" alt="Submitted equipment"><h2>${esc(i.description||'Equipment submission')}</h2><p class="small muted">${esc(i.id)}</p><p>${i.quantity} ${esc(i.priceBasis)} · Asking ${money(i.askingPricePaise)} / ${esc(i.priceBasis)}</p><p>${esc(i.createdAt)}</p>${i.offers.map(o=>`<p>Buyer offer: <b>${money(o.amountPaise)} / ${esc(o.priceBasis)}</b> · ${esc(o.status)} · ${esc(o.at)}</p>`).join('')}${role==='recycler'?`<label>Offer (₹ / ${esc(i.priceBasis)})<input id="offer-${i.id}" type="number" min="0.01" step="0.01"></label><button class="btn secondary" data-offer="${i.id}">Record buyer offer</button>`:''}</div><div>${role==='erp'?assessment(i,'broad')+assessment(i,'detailed'):assessment(i,role==='aggregator'?'broad':'detailed')}</div></div>${role==='erp'?`<details><summary>Assessment and decision history</summary><pre>${esc(JSON.stringify({assessments:i.assessments,decisions:i.decisions,offers:i.offers},null,2))}</pre></details>`:''}</article>`).join('');
 if(!items.length&&role!=='aggregator')content.innerHTML+='<p>No submissions yet. Add a photo in the aggregator view.</p>';
 loadImages();document.querySelector('#upload')?.addEventListener('submit',submit);
}
async function loadImages(){for(const img of content.querySelectorAll('[data-photo]')){try{const response=await fetch(config.endpoint+'/api/photos/'+img.dataset.photo,{headers:{Authorization:`Bearer ${config.code}`}});if(response.ok&&img.isConnected){const url=URL.createObjectURL(await response.blob());urls.push(url);img.src=url;}}catch{img.alt='Photo unavailable';}}}
async function run(fn){if(busy)return;busy=true;document.querySelectorAll('button').forEach(b=>b.disabled=true);message.textContent='Working…';try{await fn();await refresh();}catch(error){message.textContent=error.message;}finally{busy=false;document.querySelectorAll('button').forEach(b=>b.disabled=false);}}
// Submitting sends the photo straight to the broad assessment (the form says so), then prepares the
// recycler's detailed assessment in the background so that view opens with a result already saved.
async function submit(event){event.preventDefault();const form=new FormData(event.target);let timing='';
 await run(async()=>{const started=performance.now();const blob=await compressPhoto(form.get('photo')),photoId='photo-'+crypto.randomUUID(),id='item-'+crypto.randomUUID();
  const response=await fetch(config.endpoint+'/api/photos/'+photoId,{method:'PUT',headers:{Authorization:`Bearer ${config.code}`,'Content-Type':blob.type},body:blob});if(!response.ok)throw new Error('Photo upload failed.');
  await api('/items',{id,photoId,description:form.get('description'),quantity:Number(form.get('quantity')),priceBasis:form.get('basis'),askingPricePaise:Math.round(Number(form.get('price'))*100)});
  const saved=performance.now();
  try{await api('/assess',{id,scope:'broad'});timing=`Saved. Photo identified ${((performance.now()-saved)/1000).toFixed(1)} s after it was stored (${((performance.now()-started)/1000).toFixed(1)} s including upload).`;}
  catch(error){timing=`Saved, but the automatic identification failed: ${error.message} Use “Assess photo with Gemini” to retry.`;}
  api('/assess',{id,scope:'detailed'}).catch(()=>{});
 });
 if(timing)message.textContent=timing;}
// A join link (/identify.html#join=CODE, also shared as a QR code) pairs this device with the shared demo workspace.
// The fragment never reaches the server; it is removed from the address bar before pairing.
async function joinFromLink(){
 const code=new URLSearchParams(location.hash.slice(1)).get('join');if(!code)return;
 history.replaceState(null,'',location.pathname);
 if((await readState())?.sync?.code===code)return;
 message.textContent='Joining the demo workspace…';await connectWorkspace(location.origin,code);
}
document.querySelector('#connect').onclick=()=>run(async()=>{const s=await readState();if(!s?.sync?.code)await connectWorkspace(location.origin,'',true);});
document.querySelector('#refresh').onclick=()=>run(async()=>{});
document.querySelectorAll('[data-role]').forEach(button=>button.onclick=()=>{if(busy)return;role=button.dataset.role;render();refresh().catch(e=>{message.textContent=e.message;});});
// Adding a category simply appends a ticked row; nothing is saved until the person confirms.
content.addEventListener('change',event=>{const select=event.target.closest('[data-add]');if(!select||!select.value)return;
 const group=document.getElementById(select.dataset.add),scope=select.dataset.add.startsWith('picks-broad')?'broad':'detailed';
 if(![...group.querySelectorAll('input')].some(i=>i.value===select.value)){
  const wrap=document.createElement('label');wrap.className='pick';
  const box=document.createElement('input');box.type='checkbox';box.value=select.value;box.checked=true;
  wrap.append(box,' '+select.value+' · '+label(scope,select.value));group.append(wrap);
 }
 select.value='';});
content.addEventListener('click',event=>{const b=event.target.closest('button');if(!b)return;if(b.dataset.assess)run(()=>api('/assess',{id:b.dataset.assess,scope:b.dataset.scope}));if(b.dataset.confirm)run(()=>api('/confirm',{id:b.dataset.confirm,scope:b.dataset.scope,assessmentId:b.dataset.assessment,outcome:b.dataset.outcome||'categories',
  codes:b.dataset.outcome?[]:[...document.querySelectorAll(`#picks-${b.dataset.scope}-${b.dataset.confirm} input:checked`)].map(i=>i.value)}));if(b.dataset.offer)run(()=>api('/offer',{id:b.dataset.offer,amountPaise:Math.round(Number(document.getElementById('offer-'+b.dataset.offer).value)*100)}));});
joinFromLink().then(refresh).catch(e=>{message.textContent=e.message;});
