import {BROAD_CATEGORIES,categoryName} from './lot-classification.js';

export function lotPhotoPanel(form,connected,esc){
  const a=form.wasteAssessment,d=form.wasteDecision,loading=form.photoAssessmentState==='loading';
  const selected=form.photoCategoryChoices||d?.codes||a?.items.map(i=>i.code)||[];
  return `<div class="field"><strong>Waste categories · 20 broad categories</strong>
    <p class="small muted">After you take or upload a photo, Gemini suggests the visible waste types. Confirm or correct them before listing. Photos are sent to Google for this assessment; prices are entered or estimated separately.</p>
    ${!connected?`<div class="notice"><div><strong>Connect the demo workspace once</strong><p class="small">Enter your workspace pairing code to enable photo identification and shared lots.</p><label for="lot-workspace-code">Workspace pairing code</label><input id="lot-workspace-code" type="password" autocomplete="off" spellcheck="false"/><button type="button" class="btn secondary" data-action="photo-connect">Connect workspace</button></div></div>`:''}
    ${loading?'<p role="status">Identifying the photo…</p>':''}
    ${form.photoAssessmentError?`<p role="alert" class="field-error">${esc(form.photoAssessmentError)}</p>`:''}
    ${a?`<div class="suggestion-box"><strong>Suggested from your photo</strong><p>${esc(a.description)}</p>${a.items.length?`<ul>${a.items.map(i=>`<li><strong>${esc(categoryName(i.code))}</strong>${i.approximateCount?` · approximately ${i.approximateCount}`:''}<br><span class="small muted">${esc(i.evidence)}</span></li>`).join('')}</ul>`:`<p>${a.status==='out_of_scope'?'No e-waste identified.':'No category could be determined from this photo.'}</p>`}${a.uncertainty?`<p class="small">Check: ${esc(a.uncertainty)}</p>`:''}${a.nextPhoto?`<p class="small">More detail needed: ${esc(a.nextPhoto)}</p>`:''}<p class="small muted">Gemini · ${esc(a.model)} · Please review the result.</p>${a.description?'<button type="button" class="btn secondary" data-action="photo-description">Use suggested description</button>':''}</div>`:''}
    ${form.photoId?`${!loading?`<button type="button" class="btn soft" data-action="photo-assess">${a?'Use saved assessment':'Identify photo with Gemini'}</button>`:''}
      <details ${!a&&!d?'open':''}><summary>Choose or change categories (${selected.length} selected)</summary><div class="photo-category-list">${BROAD_CATEGORIES.map(c=>`<label class="photo-category-option"><input type="checkbox" data-photo-category="${c.code}" ${selected.includes(c.code)?'checked':''} ${loading?'disabled':''}/> <span>${esc(c.name)}</span></label>`).join('')}</div></details>
      <div class="row photo-category-actions"><button type="button" class="btn" data-action="photo-confirm" ${loading?'disabled':''}>Confirm categories</button><button type="button" class="btn secondary" data-action="photo-not-ewaste" ${loading?'disabled':''}>Not e-waste</button><button type="button" class="btn secondary" data-action="photo-retake" ${loading?'disabled':''}>Needs a better photo</button></div>`:'<p class="small muted">Take or upload a photo above to begin.</p>'}
    ${d?`<p class="small" role="status"><strong>Saved selection:</strong> ${esc(d.outcome==='categories'?d.codes.map(categoryName).join(', '):d.outcome==='not_ewaste'?'Not e-waste':'Replace the photo before listing')} · ${esc(d.method)}</p>`:''}
    <span class="field-error" id="equipment-error" role="alert"></span></div>`;
}

export function lotPhotoDetails(lot,esc){
  const a=lot.wasteAssessment,d=lot.wasteDecision;
  if(!a&&!d)return '';
  return `<section class="card transaction-card"><h2>Photo identification</h2><p><strong>${esc(d?d.outcome==='categories'?d.codes.map(categoryName).join(', '):d.outcome==='not_ewaste'?'Not e-waste':'Needs a better photo':'Awaiting category confirmation')}</strong></p>${a?`<p>${esc(a.description)}</p>${a.uncertainty?`<p class="small muted">${esc(a.uncertainty)}</p>`:''}<p class="small muted">Gemini · ${esc(a.model)}</p>`:''}${d?`<p class="small muted">Human decision: ${esc(d.method)}</p>`:''}</section>`;
}
