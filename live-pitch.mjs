import {BoundedPitchDetector} from './bounded-pitch.mjs';
import {centerFrame,LiveToneTracker,CANDIDATE_THRESHOLD} from './pitch-data.mjs';
export const LIVE_CONFIG=Object.freeze({size:2048,hopSeconds:.02,minimumClarity:.85,minimumRms:.0005,retentionSeconds:.06});
const distribution=values=>{if(!values.length)return null;const a=[...values].sort((a,b)=>a-b),q=p=>a[Math.round((a.length-1)*p)];return {min:a[0],p10:q(.1),median:q(.5),p90:q(.9),max:a.at(-1)};};
export class LivePitchEngine{
 constructor(rate,limits,{diagnostic=false,now=()=>performance.now(),config=LIVE_CONFIG}={}){
  this.rate=rate;this.limits=limits;this.config=config;this.now=now;this.diagnostic=diagnostic;
  this.ring=new Float32Array(config.size);this.frame=new Float32Array(config.size);this.centered=new Float32Array(config.size);
  this.detector=new BoundedPitchDetector(config.size);
  this.tracker=new LiveToneTracker(config);this.hop=Math.round(rate*config.hopSeconds);this.total=0;this.fill=0;this.at=0;
  this.blocks=0;this.receivedSamples=0;this.windows=0;this.candidates=0;this.accepted=0;this.lastTime=null;this.reasons={};this.series={rms:[],clarity:[],intervalSeconds:[],cpuMs:[],deliveryAgeMs:[]};this.events=[];this.captureGaps=0;this.rendered=0;this.renderFrames=0;
 }
 push(samples,endFrame,deliveryAgeMs=0){
  const output=[];this.blocks++;this.receivedSamples+=samples.length;
  if(endFrame!==this.total+samples.length){this.captureGaps++;this.total=endFrame-samples.length;this.fill=0;this.at=0;this.tracker=new LiveToneTracker(this.config);}
  for(const sample of samples){
   this.ring[this.at]=sample;this.at=(this.at+1)%this.ring.length;this.fill=Math.min(this.ring.length,this.fill+1);this.total++;
   if(this.fill<this.ring.length||this.total%this.hop!==0)continue;
   const start=this.now();for(let i=0;i<this.frame.length;i++)this.frame[i]=this.ring[(this.at+i)%this.ring.length];
   const frame=centerFrame(this.frame,this.centered),[candidate,clarity]=this.detector.findPitch(frame.samples,this.rate,this.limits.floor,this.limits.ceiling,CANDIDATE_THRESHOLD),time=(this.total-this.frame.length/2)/this.rate;
   const value=this.tracker.update(candidate,clarity,frame.rms,frame.clipped,time,this.limits.floor,this.limits.ceiling),cpuMs=this.now()-start;
   const point={time,hz:value.hz};output.push({...point,state:value.state});
   this.windows++;if(Number.isFinite(candidate)&&candidate>0)this.candidates++;if(value.hz!==null)this.accepted++;
   if(this.diagnostic){
    this.reasons[value.reason]=(this.reasons[value.reason]||0)+1;
    const readings={rms:frame.rms,clarity,intervalSeconds:this.lastTime===null?null:time-this.lastTime,cpuMs,deliveryAgeMs};
    for(const [key,v] of Object.entries(readings))if(v!==null&&Number.isFinite(v)&&this.series[key].length<6500)this.series[key].push(v);
    this.events.push({time,candidate:Number.isFinite(candidate)?candidate:null,accepted:value.hz,rms:frame.rms,clarity,reason:value.reason,cpuMs});if(this.events.length>100)this.events.shift();
   }
   this.lastTime=time;
  }
  return output;
 }
 noteRender(count){this.rendered=count;this.renderFrames++;}
 report(){return {enabled:this.diagnostic,rate:this.rate,config:this.config,detector:"bounded McLeod/NSDF",searchRange:this.limits,candidateThreshold:CANDIDATE_THRESHOLD,captureBlocks:this.blocks,receivedSamples:this.receivedSamples,windows:this.windows,candidates:this.candidates,accepted:this.accepted,rejections:this.reasons,captureGaps:this.captureGaps,renderFrames:this.renderFrames,acceptedPointsVisible:this.rendered,windowCenterDelayMs:this.config.size/this.rate*500,series:Object.fromEntries(Object.entries(this.series).map(([k,v])=>[k,distribution(v)])),recent:this.events};}
}
