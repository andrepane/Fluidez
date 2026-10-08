import {readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {LivePitchEngine,LIVE_CONFIG} from '../live-pitch.mjs';
import {compare} from './benchmark-live-f0.mjs';
import {compareMeasuredFrames} from '../pitch-comparison.mjs';
import {continuity} from './benchmark-bounded-pitch.mjs';
export const BEFORE_CONFIG=Object.freeze({size:2048,hopSeconds:.02,minimumClarity:.80,minimumRms:.0005,retentionSeconds:.06,adaptiveEnergy:false,recoverySeconds:0});
const quantile=(a,p)=>a.length?[...a].sort((a,b)=>a-b)[Math.round((a.length-1)*p)]:null;
const variants={before:BEFORE_CONFIG,cadence30:{...BEFORE_CONFIG,hopSeconds:.03},recovery30:{...LIVE_CONFIG,adaptiveEnergy:false},after:LIVE_CONFIG};
export function runSignal(samples,rate,config){const e=new LivePitchEngine(rate,{floor:75,ceiling:600},{diagnostic:true,config}),points=[],hop=Math.round(rate*config.hopSeconds);for(let at=0;at<samples.length;at+=hop){const end=Math.min(samples.length,at+hop);points.push(...e.push(samples.subarray(at,end),end));}return {e,points};}
if(process.argv[1]===fileURLToPath(import.meta.url)&&process.argv[2]){
 const directory=process.argv[2],rows=[];
 for(const file of readdirSync(directory).filter(f=>f.endsWith('.json'))){const name=file.slice(0,-5),ref=JSON.parse(readFileSync(directory+'/'+file)),b=readFileSync(directory+'/'+name+'.f32'),samples=new Float32Array(b.buffer,b.byteOffset,b.length/4),result={audio:name,duration:ref.duration,pcmSha256:createHash('sha256').update(b).digest('hex')},common={};
  for(const [variant,config] of Object.entries(variants)){
   const {e,points}=runSignal(samples,ref.rate,config),metrics=compare(points,ref.points,config.hopSeconds,ref.duration),report=e.report();common[variant]=metrics.common;delete metrics.common;
   const known=[];let knownTotal=0;for(const r of ref.knownVoiceRegions||[])for(const p of points.filter(p=>p.time>=r.begin&&p.time<=r.end)){knownTotal++;if(p.hz!==null)known.push(Math.abs(1200*Math.log2(p.hz/r.hz)));}
   const knownUnvoiced=points.filter(p=>(ref.knownNonperiodicRegions||[]).some(r=>p.time>=r.begin&&p.time<=r.end));
   result[variant]={...metrics,actualFrameAgreement:compareMeasuredFrames(points,ref.points),...continuity(points,.1,ref.duration-.1,config.hopSeconds),knownPeriodic:{windows:knownTotal,accepted:known.length,coverage:knownTotal?known.length/knownTotal:null,p90Cents:quantile(known,.9),octaveErrors:known.filter(c=>c>=1000&&c<=1400).length},knownNonperiodic:{windows:knownUnvoiced.length,accepted:knownUnvoiced.filter(p=>p.hz!==null).length},restarts:(ref.restarts||[]).map(t=>{const p=points.find(p=>p.time>=t&&p.time<t+.3&&p.hz!==null);return {audioRestart:t,firstAcceptedCenter:p?.time??null,causalAvailabilityDelayMs:p?(p.time+config.size/(2*ref.rate)-t)*1000:null};}),processedWindows:report.windows,hopMs:report.hopMs,cpuMs:report.series.cpuMs,windowCenterDelayMs:report.windowCenterDelayMs,recoveries:report.series.recoveryMs,rejections:report.rejections,adaptiveEnergy:report.adaptiveEnergy};
  }
  const prior=new Map(common.before.map(p=>[p.time.toFixed(7),p.cents])),paired=common.after.filter(p=>prior.has(p.time.toFixed(7)));result.sameReferenceTimes={count:paired.length,beforeP90Cents:quantile(paired.map(p=>prior.get(p.time.toFixed(7))),.9),afterP90Cents:quantile(paired.map(p=>p.cents),.9)};rows.push(result);
 }
 writeFileSync(process.argv[3]||'/tmp/pr32-update.json',JSON.stringify({before:BEFORE_CONFIG,after:LIVE_CONFIG,rows},null,2)+'\n');
}
