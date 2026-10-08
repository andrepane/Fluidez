import {fileURLToPath} from 'node:url';
import {readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {performance} from 'node:perf_hooks';
import {PitchDetector} from '../vendor/pitchy-4.1.0.mjs';
import {centerFrame,LiveToneTracker,nearestPoint} from '../pitch-data.mjs';
import {LivePitchEngine,LIVE_CONFIG} from '../live-pitch.mjs';
export function baseline(samples,rate,limits){
 const hop=Math.round(rate*.06),detector=PitchDetector.forFloat32Array(4096),tracker=new LiveToneTracker({minimumClarity:.95,minimumRms:.002}),temporary=new Float32Array(4096),points=[];
 detector.clarityThreshold=.98;
 for(let end=hop;end<=samples.length;end+=hop){if(end<4096)continue;const frame=centerFrame(samples.subarray(end-4096,end),temporary),[hz,clarity]=detector.findPitch(frame.samples,rate),time=(end-2048)/rate,value=tracker.update(hz,clarity,frame.rms,frame.clipped,time,limits.floor,limits.ceiling);points.push({time,hz:value.hz});}
 return points;
}
export function incremental(samples,rate,limits,diagnostic=false,config=LIVE_CONFIG){
 const engine=new LivePitchEngine(rate,limits,{diagnostic,config}),points=[],hop=Math.round(rate*.06);
 for(let at=0;at<samples.length;at+=hop){const end=Math.min(samples.length,at+hop);points.push(...engine.push(samples.subarray(at,end),end));}
 return {points,diagnostic:engine.report()};
}
const quantile=(a,p)=>a.length?[...a].sort((a,b)=>a-b)[Math.round((a.length-1)*p)]:null;
export function compare(points,reference,hop,duration){
 let voiced=0,unvoiced=0,acceptedVoiced=0,unvoicedAccepted=0,octaves=0;const cents=[],common=[];
 // Common Praat 10 ms grid. Nearest live frame within half its hop;
 // no interpolation, no future data, first/last 100 ms excluded.
 for(const r of reference){if(r.time<.1||r.time>duration-.1)continue;const p=nearestPoint(points,r.time),hz=p&&Math.abs(p.time-r.time)<=hop/2+.000001?p.hz:null;
  if(r.hz!==null)voiced++;else unvoiced++;
  if(hz!==null&&r.hz!==null){acceptedVoiced++;const e=Math.abs(1200*Math.log2(hz/r.hz));cents.push(e);if(e>=1000&&e<=1400)octaves++;common.push({time:r.time,cents:e});}
  else if(hz!==null)unvoicedAccepted++;
 }
 return {voicedReference:voiced,unvoicedReference:unvoiced,acceptedVoiced,coverage:voiced?acceptedVoiced/voiced:null,unvoicedAccepted,unvoicedRate:unvoiced?unvoicedAccepted/unvoiced:null,medianCents:quantile(cents,.5),p90Cents:quantile(cents,.9),octaveDisagreements:octaves,common};
}
if(process.argv[1]===fileURLToPath(import.meta.url)&&process.argv[2]){
 const directory=process.argv[2],rows=[];
 for(const file of readdirSync(directory).filter(f=>f.endsWith('.json')&&f!=='comparison.json')){const name=file.slice(0,-5),ref=JSON.parse(readFileSync(directory+'/'+file)),buffer=readFileSync(directory+'/'+name+'.f32'),samples=new Float32Array(buffer.buffer,buffer.byteOffset,buffer.length/4),limits={floor:75,ceiling:600};
  const t0=performance.now(),old=baseline(samples,ref.rate,limits),t1=performance.now(),next=incremental(samples,ref.rate,limits,true),t2=performance.now(),current=incremental(samples,ref.rate,limits,false,{...LIVE_CONFIG,minimumClarity:.85,retentionSeconds:0});
  const a=compare(old,ref.points,.06,ref.duration),b=compare(next.points,ref.points,.02,ref.duration),paired=[];
  for(const p of a.common){const q=b.common.find(q=>Math.abs(q.time-p.time)<1e-6);if(q)paired.push({old:p.cents,next:q.cents});}
  rows.push({audio:name,duration:ref.duration,previousMain:compare(current.points,ref.points,.02,ref.duration),before:{...a,cpuMs:t1-t0},after:{...b,cpuMs:t2-t1},sameAcceptedTimes:{count:paired.length,beforeMedianCents:quantile(paired.map(p=>p.old),.5),afterMedianCents:quantile(paired.map(p=>p.next),.5)},diagnostic:next.diagnostic});
 }
 writeFileSync(process.argv[3]||directory+'/comparison.json',JSON.stringify(rows,null,2));
}
