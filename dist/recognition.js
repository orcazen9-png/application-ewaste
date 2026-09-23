import {translations} from './i18n.js';
import {EQUIPMENT_CODES} from './equipment.js';

// Photo → experimental ITEW suggestion. The local dev server forwards /api/recognize to the
// loopback Python service; where no recognition service is deployed the request fails and
// the user chooses the category manually. Nothing here saves a category.
export const RECOGNIZE_URL='/api/recognize';

export async function suggestEquipment(blob,{timeoutMs=30000}={}){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
  let response;
  try{response=await fetch(RECOGNIZE_URL,{method:'POST',headers:{'Content-Type':blob.type||'image/jpeg'},body:blob,signal:controller.signal});}
  catch{return {status:'unavailable'};}
  finally{clearTimeout(timer);}
  if([404,501,502,503,504].includes(response.status))return {status:'unavailable'};
  if(!response.ok)return {status:'failed'};
  let data;try{data=await response.json();}catch{return {status:'failed'};}
  return parseSuggestion(data);
}

export function parseSuggestion(data){
  const candidates=Array.isArray(data?.candidates)?data.candidates.filter(c=>EQUIPMENT_CODES.has(c?.code)&&Number.isFinite(c.score)&&c.score>=0&&c.score<=1).slice(0,3):[];
  if(data?.scope!=='itew'||!candidates.length)return {status:'failed'};
  return {status:'ready',uncertain:data.uncertain!==false,modelId:/^[a-f0-9]{16}$/.test(data.model_id||'')?data.model_id:null,
    candidates:candidates.map(c=>({code:c.code,score:c.score}))};
}

// A suggestion only becomes a saved category through one of these explicit user choices.
export function decide(choice,suggestion,now=new Date().toISOString()){
  if(!choice)return {equipmentCode:'',equipmentDecision:null};
  const candidates=suggestion?.status==='ready'?suggestion.candidates:[];
  const code=choice==='NONE'?'':choice;
  const method=choice==='NONE'?'not-itew':!candidates.length?'manual':code===candidates[0].code?'suggestion-confirmed':'suggestion-corrected';
  return {equipmentCode:code,equipmentDecision:{method,candidates,modelId:suggestion?.modelId||null,decidedAt:now}};
}

const rows={
  validationPhotoCategories:['Wait for identification, then confirm or correct the photo categories. Replace the photo if it needs a retake.','पहचान पूरी होने के बाद फोटो की श्रेणियों की पुष्टि करें या सुधारें। जरूरत हो तो नई फोटो जोड़ें।','ओळख पूर्ण झाल्यावर फोटोच्या श्रेणींची पुष्टी करा किंवा दुरुस्त करा. गरज असल्यास नवीन फोटो जोडा.'],
  equipment:['Equipment category (ITEW)','उपकरण श्रेणी (ITEW)','उपकरण श्रेणी (ITEW)'],
  equipmentHelp:['After you add a photo, an experimental model suggests an IT or telecom equipment category. Confirm it or choose the correct one. It does not change the price estimate.','फोटो जोड़ने के बाद एक प्रायोगिक मॉडल आईटी या टेलीकॉम उपकरण की श्रेणी सुझाता है। इसकी पुष्टि करें या सही श्रेणी चुनें। इससे मूल्य अनुमान नहीं बदलता।','फोटो जोडल्यानंतर एक प्रायोगिक मॉडेल आयटी किंवा टेलिकॉम उपकरणाची श्रेणी सुचवते. तिची पुष्टी करा किंवा योग्य श्रेणी निवडा. यामुळे किंमत अंदाज बदलत नाही.'],
  equipmentChoose:['Choose equipment category','उपकरण श्रेणी चुनें','उपकरण श्रेणी निवडा'],
  equipmentNone:['Not an ITEW device / mixed material','ITEW उपकरण नहीं / मिश्रित सामग्री','ITEW उपकरण नाही / मिश्र साहित्य'],
  equipmentAddPhoto:['Add a photo to get a suggestion.','सुझाव पाने के लिए फोटो जोड़ें।','सूचना मिळवण्यासाठी फोटो जोडा.'],
  suggesting:['Suggesting a category from the photo…','फोटो से श्रेणी सुझाई जा रही है…','फोटोवरून श्रेणी सुचवली जात आहे…'],
  suggestionTitle:['Suggested from the photo','फोटो से सुझाव','फोटोवरून सूचना'],
  suggestionUncertain:['Low certainty. Check the device carefully.','कम निश्चितता। उपकरण ध्यान से जांचें।','कमी खात्री. उपकरण काळजीपूर्वक तपासा.'],
  suggestionNote:['Suggestions can be wrong, and scores are not confidence. Nothing is saved until you choose.','सुझाव गलत हो सकते हैं और स्कोर भरोसे का माप नहीं है। आपके चुनने तक कुछ सहेजा नहीं जाता।','सूचना चुकीच्या असू शकतात आणि गुण म्हणजे खात्री नाही. तुम्ही निवडेपर्यंत काहीही जतन होत नाही.'],
  modelScore:['model score','मॉडल स्कोर','मॉडेल गुण'],
  confirmSuggestion:['Confirm','पुष्टि करें','पुष्टी करा'],
  useThis:['Use this','यह चुनें','हे निवडा'],
  suggestionUnavailable:['Automatic suggestions are unavailable. Choose the category yourself.','स्वचालित सुझाव उपलब्ध नहीं हैं। श्रेणी स्वयं चुनें।','स्वयंचलित सूचना उपलब्ध नाहीत. श्रेणी स्वतः निवडा.'],
  suggestionFailed:['No suggestion for this photo. Choose the category yourself.','इस फोटो के लिए कोई सुझाव नहीं। श्रेणी स्वयं चुनें।','या फोटोसाठी सूचना नाही. श्रेणी स्वतः निवडा.'],
  retrySuggestion:['Try again','फिर कोशिश करें','पुन्हा प्रयत्न करा'],
  suggestFromPhoto:['Suggest from photo','फोटो से सुझाव लें','फोटोवरून सूचना घ्या'],
  provisionalCategory:['Provisional category: check the device specification.','अस्थायी श्रेणी: उपकरण का विवरण जांचें।','तात्पुरती श्रेणी: उपकरणाचे तपशील तपासा.'],
  'suggestion-confirmed':['Confirmed suggestion','सुझाव की पुष्टि की','सूचनेची पुष्टी केली'],
  'suggestion-corrected':['Corrected suggestion','सुझाव सुधारा','सूचना दुरुस्त केली'],
  manual:['Chosen manually','स्वयं चुना','स्वतः निवडले'],
  'not-itew':['Not an ITEW device','ITEW उपकरण नहीं','ITEW उपकरण नाही'],
  suggestedWas:['suggested','सुझाया गया','सुचवले'],
  validationEquipment:['Confirm or correct the suggested equipment category, or choose “Not an ITEW device”.','सुझाई गई उपकरण श्रेणी की पुष्टि करें या सुधारें, या “ITEW उपकरण नहीं” चुनें।','सुचवलेल्या उपकरण श्रेणीची पुष्टी करा किंवा दुरुस्त करा, किंवा “ITEW उपकरण नाही” निवडा.'],
  noEquipment:['Not recorded','दर्ज नहीं','नोंद नाही']
};
for(const [key,values]of Object.entries(rows))for(const [i,lang]of ['en','hi','mr'].entries())translations[lang][key]=values[i];
