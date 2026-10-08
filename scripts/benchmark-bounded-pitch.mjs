import {fileURLToPath} from 'node:url';
import {readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {PitchDetector} from '../vendor/pitchy-4.1.0.mjs';
import {centerFrame,LiveToneTracker,CANDIDATE_THRESHOLD} from '../pitch-data.mjs';
import {LivePitchEngine,LIVE_CONFIG} from '../live-pitch.mjs';
import {compare} from './benchmark-live-f0.mjs';
// Exact previous live configuration; the only difference is peak selection.
export function previousLive(samples,rate,limits){
 const detector=PitchDetector.forFloat32Array(LIVE_CONFIG.size),tracker=new LiveToneTracker({minimumClarity:.85,minimumRms:.0005,retentionSeconds:.06}),frame=new Float32Array(LIVE_CONFIG.size),points=[],hop=Math.round(rate*.02);
 detector.clarityThreshold=CANDIDATE_THRESHOLD;
 for(let end=hop;end<=samples.length;end+=hop){if(end<frame.length)continue;const f=centerFrame(samples.subarray(end-frame.length,end),frame),[hz,clarity]=detector.findPitch(f.samples,rate),time=(end-frame.length/2)/rate,value=tracker.update(hz,clarity,f.rms,f.clipped,time,limits.floor,limits.ceiling);points.push({time,hz:value.hz});}return points;
}
export function continuity(points,begin=.1,end=Infinity,hopSeconds=LIVE_CONFIG.hopSeconds){let longest=0,run=0,cuts=0,wasVoiced=false;for(const p of points.filter(p=>p.time>=begin&&p.time<=end)){if(p.hz===null){if(wasVoiced)cuts++;run=0;wasVoiced=false;}else{run++;longest=Math.max(longest,run);wasVoiced=true;}}return {nullTransitions:cuts,longestDetectedRunSeconds:longest*hopSeconds};}
if(process.argv[1]===fileURLToPath(import.meta.url)&&process.argv[2]){
 const directory=process.argv[2],rows=[];
 for(const file of readdirSync(directory).filter(p=>p.endsWith('.json'))){const name=file.slice(0,-5),ref=JSON.parse(readFileSync(directory+'/'+file)),b=readFileSync(directory+'/'+name+'.f32'),samples=new Float32Array(b.buffer,b.byteOffset,b.length/4),limits={floor:75,ceiling:600},old=previousLive(samples,ref.rate,limits),engine=new LivePitchEngine(ref.rate,limits,{diagnostic:true,config:{size:2048,hopSeconds:.02,minimumClarity:.85,minimumRms:.0005,retentionSeconds:.06}}),next=[];
 const hop=Math.round(ref.rate*.02);for(let at=0;at<samples.length;at+=hop){const end=Math.min(samples.length,at+hop);next.push(...engine.push(samples.subarray(at,end),end));}
 const metrics=(points,hop)=>{const c=compare(points,ref.points,hop,ref.duration);delete c.common;return {...c,...continuity(points,.1,ref.duration-.1,hop)};};
 rows.push({audio:name,duration:ref.duration,before:metrics(old,.02),after:metrics(next,.02),diagnostic:engine.report()});
 }
 writeFileSync(process.argv[3]||'/tmp/bounded-comparison.json',JSON.stringify(rows,null,2));
}
