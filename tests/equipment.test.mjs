import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createState,saveLot} from '../dist/domain.js';
import {EQUIPMENT,normalizeEquipment} from '../dist/equipment.js';
import {parseSuggestion,decide,suggestEquipment} from '../dist/recognition.js';
import {lotInput} from '../dist/sync.js';

const NOW='2026-09-22T10:00:00.000Z';
const base=()=>({id:'lot-fixed',materialId:'cables',locality:'Mumbai',weight:'12.5',photoId:'photo-test',description:'Test lot'});
const suggestion=parseSuggestion({scope:'itew',model_id:'0123456789abcdef',uncertain:true,candidates:[{code:'ITEW15',score:.62},{code:'ITEW20',score:.2},{code:'CEEW1',score:.1},{code:'ITEW12',score:.05}]});

test('app equipment list is exactly ITEW1–27 from the ML taxonomy',async()=>{
  const taxonomy=JSON.parse((await readFile('ml/taxonomy.json','utf8')).replace(/^﻿/,''));
  const itew=taxonomy.categories.filter(c=>c.code.startsWith('ITEW'));
  assert.deepEqual(EQUIPMENT,itew.map(c=>({code:c.code,name:c.name,provisional:c.rule_status==='provisional',followUp:c.follow_up})));
  assert.equal(EQUIPMENT.length,27);
});

test('suggestions are parsed as ITEW-only top three and never saved on their own',()=>{
  assert.deepEqual(suggestion.candidates.map(c=>c.code),['ITEW15','ITEW20','ITEW12']);
  assert.equal(parseSuggestion({scope:'all',candidates:[{code:'ITEW1',score:.9}]}).status,'failed');
  const s=createState(NOW);
  const lot=saveLot(s,{...base(),equipmentSuggestion:suggestion},{publish:true,now:NOW});
  assert.equal(lot.equipmentCode,'');assert.equal(lot.equipmentDecision,null);
});

test('confirming, correcting, manual choice and not-ITEW are recorded as user decisions',()=>{
  const confirmed=normalizeEquipment(decide('ITEW15',suggestion,NOW));
  assert.equal(confirmed.equipmentCode,'ITEW15');assert.equal(confirmed.equipmentDecision.method,'suggestion-confirmed');
  assert.equal(confirmed.equipmentDecision.suggestedCode,'ITEW15');assert.equal(confirmed.equipmentDecision.modelId,'0123456789abcdef');
  const corrected=normalizeEquipment(decide('ITEW12',suggestion,NOW));
  assert.equal(corrected.equipmentDecision.method,'suggestion-corrected');assert.equal(corrected.equipmentDecision.suggestedCode,'ITEW15');
  assert.equal(normalizeEquipment(decide('ITEW3',{status:'unavailable'},NOW)).equipmentDecision.method,'manual');
  const none=normalizeEquipment(decide('NONE',suggestion,NOW));
  assert.equal(none.equipmentCode,'');assert.equal(none.equipmentDecision.method,'not-itew');
  assert.deepEqual(decide('',suggestion,NOW),{equipmentCode:'',equipmentDecision:null});
});

test('inconsistent or unsupported equipment decisions are rejected',()=>{
  const s=createState(NOW);
  assert.throws(()=>saveLot(s,{...base(),equipmentCode:'CEEW1',equipmentDecision:{method:'manual'}}),/supported equipment/);
  assert.throws(()=>saveLot(s,{...base(),equipmentCode:'ITEW12',equipmentDecision:{method:'suggestion-confirmed',candidates:suggestion.candidates}}),/does not match/);
  assert.throws(()=>saveLot(s,{...base(),equipmentCode:'ITEW15'}),/Confirm or choose/);
  assert.throws(()=>saveLot(s,{...base(),equipmentCode:'ITEW15',equipmentDecision:{method:'not-itew'}}),/does not match/);
});

test('equipment is kept separate from material pricing and offers',()=>{
  const s=createState(NOW);
  const lot=saveLot(s,base(),{publish:true,now:NOW});
  s.offers.push({id:'offer',lotId:lot.id,status:'pending'});
  const before=structuredClone(lot.estimate);
  const edited=saveLot(s,{...lot,...decide('ITEW15',suggestion,NOW),expectedVersion:lot.version},{publish:true,now:'2026-09-22T11:00:00.000Z'});
  assert.equal(edited.equipmentCode,'ITEW15');
  assert.deepEqual(edited.estimate,before);assert.equal(edited.valuationHistory.length,1);
  assert.equal(s.offers[0].status,'pending');
});

test('equipment decisions survive sync, and older commands without the fields keep them',()=>{
  const device=createState(NOW);
  const lot=saveLot(device,{...base(),...decide('ITEW12',suggestion,NOW)},{publish:true,now:NOW});
  const wire=JSON.parse(JSON.stringify(lotInput(lot,device)));
  const server=createState(NOW);
  const synced=saveLot(server,wire,{publish:true,now:NOW});
  assert.equal(synced.equipmentCode,'ITEW12');assert.deepEqual(synced.equipmentDecision,lot.equipmentDecision);
  const legacy=saveLot(server,{...base(),expectedVersion:synced.version},{publish:true,now:NOW});
  assert.equal(legacy.equipmentCode,'ITEW12');
});

test('unreachable or untrained recognition reports unavailable instead of a guess',async()=>{
  const original=globalThis.fetch;
  try{
    globalThis.fetch=async()=>new Response('{"detail":"No trained ITEW model yet."}',{status:503});
    assert.deepEqual(await suggestEquipment(new Blob(['x'],{type:'image/jpeg'})),{status:'unavailable'});
    globalThis.fetch=async()=>{throw new TypeError('offline');};
    assert.deepEqual(await suggestEquipment(new Blob(['x'])),{status:'unavailable'});
    globalThis.fetch=async()=>Response.json({scope:'itew',model_id:'0123456789abcdef',uncertain:false,candidates:[{code:'ITEW24',score:.8}]});
    const ready=await suggestEquipment(new Blob(['x']));
    assert.equal(ready.status,'ready');assert.equal(ready.uncertain,false);assert.equal(ready.candidates[0].code,'ITEW24');
  }finally{globalThis.fetch=original;}
});
