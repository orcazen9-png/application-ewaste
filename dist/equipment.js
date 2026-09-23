// ITEW1–27 equipment classes, copied from ml/taxonomy.json (tests/equipment.test.mjs checks they stay identical).
// Equipment classification is separate from material pricing: it never changes a lot's estimate.
export const EQUIPMENT=[
  {"code": "ITEW1", "name": "Centralized data processing: Mainframes, Minicomputers", "provisional": false, "followUp": "Confirm the device category shown."},
  {"code": "ITEW2", "name": "Personal Computers (Central Processing Unit with input and output devices)", "provisional": false, "followUp": "Confirm the device category shown."},
  {"code": "ITEW3", "name": "Laptop Computers (Central Processing Unit with input and output devices)", "provisional": true, "followUp": "Is this recorded as a laptop or notebook in the device specification?"},
  {"code": "ITEW4", "name": "Notebook Computers", "provisional": true, "followUp": "Is this recorded as a notebook rather than a laptop in the device specification?"},
  {"code": "ITEW5", "name": "Notepad Computers", "provisional": true, "followUp": "What does Notepad Computer mean in your inventory? Provide a model or device specification."},
  {"code": "ITEW6", "name": "Printers including cartridges", "provisional": false, "followUp": "Is this primarily a printer, a copier, or a standalone cartridge?"},
  {"code": "ITEW7", "name": "Copying Equipment", "provisional": false, "followUp": "Is copying the primary function of this model?"},
  {"code": "ITEW8", "name": "Electrical and Electronic Typewriters", "provisional": false, "followUp": "Confirm the device category shown."},
  {"code": "ITEW9", "name": "User Terminal and Systems", "provisional": false, "followUp": "Confirm the device category shown."},
  {"code": "ITEW10", "name": "Facsimile", "provisional": false, "followUp": "Does the label or specification identify a fax machine?"},
  {"code": "ITEW11", "name": "Telex", "provisional": false, "followUp": "Confirm the device category shown."},
  {"code": "ITEW12", "name": "Telephones", "provisional": false, "followUp": "Confirm the device category shown."},
  {"code": "ITEW13", "name": "Pay Telephones", "provisional": false, "followUp": "Confirm the device category shown."},
  {"code": "ITEW14", "name": "Cordless Telephones", "provisional": false, "followUp": "Confirm the device category shown."},
  {"code": "ITEW15", "name": "Cellular Telephones", "provisional": false, "followUp": "What is the phone model, and does your phablet rule apply?"},
  {"code": "ITEW16", "name": "Answering System", "provisional": false, "followUp": "Confirm the device category shown."},
  {"code": "ITEW17", "name": "Telecommunications transmission equipment", "provisional": true, "followUp": "Does a more specific telecom equipment category apply?"},
  {"code": "ITEW18", "name": "BTS components excluding tower", "provisional": false, "followUp": "Confirm the device category shown."},
  {"code": "ITEW19", "name": "Tablets, iPad", "provisional": false, "followUp": "Is this a tablet or a large-screen phone?"},
  {"code": "ITEW20", "name": "Phablets", "provisional": true, "followUp": "What phone models or screen-size rule count as phablets in your inventory?"},
  {"code": "ITEW21", "name": "Scanners", "provisional": false, "followUp": "Confirm the device category shown."},
  {"code": "ITEW22", "name": "Routers", "provisional": false, "followUp": "Does this model include a modem, or is it a router only?"},
  {"code": "ITEW23", "name": "GPS", "provisional": false, "followUp": "Confirm the device category shown."},
  {"code": "ITEW24", "name": "UPS", "provisional": false, "followUp": "Is this a computer UPS or a home inverter/UPS?"},
  {"code": "ITEW25", "name": "Inverter", "provisional": false, "followUp": "Is this a home inverter or a computer UPS?"},
  {"code": "ITEW26", "name": "Modems", "provisional": false, "followUp": "Does the model specification identify modem functionality?"},
  {"code": "ITEW27", "name": "Electronic Data Storage Devices", "provisional": false, "followUp": "Confirm the device category shown."}
];
export const EQUIPMENT_CODES=new Set(EQUIPMENT.map(e=>e.code));
export const equipmentByCode=code=>EQUIPMENT.find(e=>e.code===code)||null;
// How the saved category was decided. A model suggestion is never saved without one of these user decisions.
export const DECISIONS=['suggestion-confirmed','suggestion-corrected','manual','not-itew'];
const score=value=>Number.isFinite(value)&&value>=0&&value<=1?Math.round(value*10000)/10000:null;
export function normalizeEquipment(input={},now=new Date().toISOString()){
  const code=String(input.equipmentCode||'');
  const raw=input.equipmentDecision;
  if(!code&&!raw)return {equipmentCode:'',equipmentDecision:null};
  if(code&&!EQUIPMENT_CODES.has(code))throw new Error('Choose a supported equipment category.');
  if(!raw||!DECISIONS.includes(raw.method))throw new Error('Confirm or choose the equipment category.');
  if((raw.method==='not-itew')!==(code===''))throw new Error('Equipment category does not match the decision.');
  const candidates=Array.isArray(raw.candidates)?raw.candidates.slice(0,3).filter(c=>EQUIPMENT_CODES.has(c?.code)).map(c=>({code:c.code,score:score(c.score)})):[];
  const suggestedCode=candidates[0]?.code||'';
  if(raw.method.startsWith('suggestion-')){
    if(!suggestedCode)throw new Error('A suggestion decision needs the suggested categories.');
    if((raw.method==='suggestion-confirmed')!==(code===suggestedCode))throw new Error('Equipment decision does not match the suggestion.');
  }
  const decidedAt=Number.isFinite(new Date(raw.decidedAt).getTime())?new Date(raw.decidedAt).toISOString():now;
  return {equipmentCode:code,equipmentDecision:{method:raw.method,suggestedCode,candidates,modelId:/^[a-f0-9]{16}$/.test(raw.modelId||'')?raw.modelId:null,scope:'itew',decidedAt}};
}
