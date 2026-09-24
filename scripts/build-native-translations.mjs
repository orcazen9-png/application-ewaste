import {translations} from '../dist/i18n.js';
import '../dist/flow-i18n.js';
import {CATALOG} from '../dist/waste-catalog.js';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
const output={};
for(const [key,en] of Object.entries(translations.en))if(typeof en==='string'&&typeof translations.hi[key]==='string'&&typeof translations.mr[key]==='string')output[en]=[translations.hi[key],translations.mr[key]];
for(const source of ['ui-translations','error-translations','redesign-translations'])for(const line of (await readFile('native-android/'+source+'.tsv','utf8')).split(/\r?\n/)){if(!line)continue;const values=line.split('\t').map(v=>v.replaceAll('\\n','\n').replace(/\\s$/,' '));if(values.length!==3||values.some(v=>!v))throw new Error('Invalid translation row: '+values[0]);output[values[0]]=values.slice(1);}
const localized=new Map();for(const line of (await readFile('native-android/category-translations.tsv','utf8')).trim().split(/\r?\n/)){const [code,hi,mr,...extra]=line.split('\t');if(!hi||!mr||extra.length||localized.has(code))throw new Error('Invalid category translation: '+code);localized.set(code,[hi,mr]);}
for(const category of CATALOG.categories){if(!localized.has(category.code))throw new Error('Missing category translation: '+category.code);output[category.name]=localized.get(category.code);}
if(localized.size!==CATALOG.categories.length)throw new Error('Unexpected category translation code');
await mkdir('native-android/app/src/main/assets',{recursive:true});await writeFile('native-android/app/src/main/assets/ui-translations.json',JSON.stringify(output,null,2)+'\n');
console.log('Built '+Object.keys(output).length+' Hindi/Marathi UI phrases.');
