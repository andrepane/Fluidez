import {readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {performance} from 'node:perf_hooks';
import {PitchDetector} from '../vendor/pitchy-4.1.0.mjs';
import {centerFrame,nearestPoint} from '../pitch-data.mjs';
class Tracker{
 constructor(c){this.c=c;this.previous=null;this.pending=null;this.lastTime=-1;}
 update(hz,clarity,rms,clipped,time){const c=this.c;if(time-this.lastTime>.25){this.previous=null;this.pending=null;}this.lastTime=time;const reject=reason=>{this.pending=null;this.previous=null;return {hz:null,reason};};if(clipped>.01)return reject('clip');if(rms<c.rms)return reject('weak');if(!Number.isFinite(hz)||hz<=0||clarity<c.quality)return reject('clarity');if(hz<75||hz>600)return reject('range');const jump=this.previous===null||Math.abs(12*Math.log2(hz/this.previous))>7;if(jump){if(this.pending&&Math.abs(12*Math.log2(hz/this.pending))<2){this.previous=hz;this.pending=null;return {hz,reason:'accepted'};}if(c.onset&&this.previous===null&&clarity>=.95){this.previous=hz;return {hz,reason:'accepted'};}this.pending=hz;return {hz:null,reason:'confirm'};}this.previous=hz;this.pending=null;return {hz,reason:'accepted'};}
}
const directory=process.argv[2]||'/tmp/f0-bench';
const configs=[];for(const size of [4096,3072,2048])for(const quality of [.95,.9,.85,.8])configs.push({name:`${size}-${quality}`,size,quality,rms:.002,hop:.06,candidate:.98,onset:false});
configs.push(...[{name:'short20',size:2048,quality:.85,rms:.002,hop:.02,candidate:.98,onset:false},{name:'mid20',size:3072,quality:.85,rms:.002,hop:.02,candidate:.98,onset:false},{name:'short20quiet',size:2048,quality:.85,rms:.0005,hop:.02,candidate:.98,onset:false},{name:'mid20quiet',size:3072,quality:.85,rms:.0005,hop:.02,candidate:.98,onset:false},{name:'mid20onset',size:3072,quality:.85,rms:.0005,hop:.02,candidate:.98,onset:true},{name:'mid95',size:3072,quality:.85,rms:.0005,hop:.02,candidate:.95,onset:true}]);
const median=a=>a.length?[...a].sort((a,b)=>a-b)[Math.floor(a.length/2)]:null;
const result=[];for(const c of configs){for(const file of readdirSync(directory).filter(p=>p.endsWith('.json'))){const name=file.slice(0,-5),ref=JSON.parse(readFileSync(directory+'/' +file)),buf=readFileSync(directory+'/' +name+'.f32'),samples=new Float32Array(buf.buffer,buf.byteOffset,buf.length/4),hop=Math.round(ref.rate*c.hop),detector=PitchDetector.forFloat32Array(c.size),tracker=new Tracker(c),temp=new Float32Array(c.size);detector.clarityThreshold=c.candidate;
 let n=0,accepted=0,refVoiced=0,both=0,falsePos=0,octaves=0;const errors=[],reasons={};const start=performance.now();
 // Same trailing causal window as real capture: no future samples.
 for(let end=hop;end<=samples.length;end+=hop){if(end<c.size)continue;const frame=centerFrame(samples.subarray(end-c.size,end),temp),[hz,clarity]=detector.findPitch(frame.samples,ref.rate),time=(end-c.size/2)/ref.rate,v=tracker.update(hz,clarity,frame.rms,frame.clipped,time),r=nearestPoint(ref.points,time);n++;reasons[v.reason]=(reasons[v.reason]||0)+1;if(v.hz)accepted++;if(!r||Math.abs(r.time-time)>.011)continue;if(r.hz)refVoiced++;if(v.hz&&r.hz){both++;const cents=Math.abs(1200*Math.log2(v.hz/r.hz));errors.push(cents);if(cents>1000&&cents<1400)octaves++;}else if(v.hz&&!r.hz)falsePos++;}
 result.push({config:c.name,audio:name,n,accepted,refVoiced,both,falsePos,octaves,medianCents:median(errors),p90Cents:errors.length?[...errors].sort((a,b)=>a-b)[Math.floor(errors.length*.9)]:null,cpuMs:performance.now()-start,reasons});}}
writeFileSync(process.argv[3]||'/tmp/f0-sweep.json',JSON.stringify({configs,results:result},null,2));
