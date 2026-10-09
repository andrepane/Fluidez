import {readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {LivePitchEngine,LIVE_CONFIG} from '../live-pitch.mjs';
import {compare} from './benchmark-live-f0.mjs';
import {compareMeasuredFrames} from '../pitch-comparison.mjs';
const rows=[];
for(const file of readdirSync(process.argv[2]).filter(f=>f.endsWith('.json'))){const name=file.slice(0,-5),ref=JSON.parse(readFileSync(process.argv[2]+'/'+file)),b=readFileSync(process.argv[2]+'/'+name+'.f32'),samples=new Float32Array(b.buffer,b.byteOffset,b.length/4),row={audio:name,pcmSha256:createHash('sha256').update(b).digest('hex'),duration:ref.duration};for(const engine of ['current','yin']){const e=new LivePitchEngine(ref.rate,{floor:75,ceiling:600},{engine,diagnostic:true}),points=[],hop=Math.round(ref.rate*LIVE_CONFIG.hopSeconds),start=performance.now();for(let at=0;at<samples.length;at+=hop){const end=Math.min(samples.length,at+hop);points.push(...e.push(samples.subarray(at,end),end));}const elapsedMs=performance.now()-start,metrics=compare(points,ref.points,LIVE_CONFIG.hopSeconds,ref.duration);delete metrics.common;row[engine]={...metrics,actualFrames:compareMeasuredFrames(points,ref.points),processedWindows:e.windows,elapsedMs,cpu:e.report().series.cpuMs};}rows.push(row);}
writeFileSync(process.argv[3],JSON.stringify({config:LIVE_CONFIG,referenceRange:{floor:75,ceiling:600},rows},null,2)+'\n');
