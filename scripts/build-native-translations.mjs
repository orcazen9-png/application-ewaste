import {translations} from '../dist/i18n.js';
import '../dist/flow-i18n.js';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
const output={};
for(const [key,en] of Object.entries(translations.en))if(typeof en==='string'&&typeof translations.hi[key]==='string'&&typeof translations.mr[key]==='string')output[en]=[translations.hi[key],translations.mr[key]];
for(const line of (await readFile('native-android/ui-translations.tsv','utf8')).split(/\r?\n/)){if(!line)continue;const values=line.split('\t').map(v=>v.replace(/\\s$/,' '));if(values.length!==3||values.some(v=>!v))throw new Error('Invalid translation row: '+values[0]);output[values[0]]=values.slice(1);}
await mkdir('native-android/app/src/main/assets',{recursive:true});await writeFile('native-android/app/src/main/assets/ui-translations.json',JSON.stringify(output,null,2)+'\n');
console.log('Built '+Object.keys(output).length+' Hindi/Marathi UI phrases.');
