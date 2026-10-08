import {fileURLToPath} from 'node:url';
import {readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {incremental,compare} from './benchmark-live-f0.mjs';
import {LIVE_CONFIG} from '../live-pitch.mjs';
import {continuity} from './benchmark-bounded-pitch.mjs';
// Same bounded detector, PCM, hop and search range; only periodicity changes.
if(process.argv[1]===fileURLToPath(import.meta.url)&&process.argv[2]){
 const directory=process.argv[2],rows=[];
 for(const file of readdirSync(directory).filter(f=>f.endsWith('.json')&&f!=='comparison.json')){
  const name=file.slice(0,-5),ref=JSON.parse(readFileSync(directory+'/'+file)),b=readFileSync(directory+'/'+name+'.f32'),x=new Float32Array(b.buffer,b.byteOffset,b.length/4);
  const run=minimumClarity=>{const output=incremental(x,ref.rate,{floor:75,ceiling:600},true,{...LIVE_CONFIG,minimumClarity}),metrics=compare(output.points,ref.points,.02,ref.duration);delete metrics.common;return {...metrics,...continuity(output.points,.1,ref.duration-.1),rejections:output.diagnostic.rejections,cpuMs:output.diagnostic.series.cpuMs};};
  rows.push({audio:name,duration:ref.duration,before:run(.85),after:run(.80)});
 }
 writeFileSync(process.argv[3]||'/tmp/tolerant-pitch.json',JSON.stringify({beforeMinimumClarity:.85,afterMinimumClarity:.80,rows},null,2)+'\n');
}
