import {AdaptiveEnergyGate} from './adaptive-energy.mjs';
import {BoundedPitchDetector} from './bounded-pitch.mjs';
import {centerFrame,LiveToneTracker,CANDIDATE_THRESHOLD} from './pitch-data.mjs';
export const LIVE_CONFIG=Object.freeze({size:2048,hopSeconds:.01,minimumClarity:.80,minimumRms:.0005,retentionSeconds:.06,adaptiveEnergy:true,quietMinimumRms:.00005,quietClarity:.92,noiseRatio:3,recoverySeconds:.15,recoveryClarity:.92,confirmationSeconds:.03});
const distribution=values=>{if(!values.length)return null;const a=[...values].sort((a,b)=>a-b),q=p=>a[Math.round((a.length-1)*p)];return {min:a[0],p10:q(.1),median:q(.5),p90:q(.9),max:a.at(-1)};};
export class LivePitchEngine{
 constructor(rate,limits,{diagnostic=false,now=()=>performance.now(),config=LIVE_CONFIG}={}){
  this.rate=rate;this.limits=limits;this.config=config;this.now=now;this.diagnostic=diagnostic;
  this.ring=new Float32Array(config.size);this.frame=new Float32Array(config.size);this.centered=new Float32Array(config.size);
  this.detector=new BoundedPitchDetector(config.size);
  this.energy=config.adaptiveEnergy?new AdaptiveEnergyGate(config):null;this.tracker=new LiveToneTracker(config);this.hop=Math.round(rate*config.hopSeconds);this.total=0;this.fill=0;this.at=0;
  this.blocks=0;this.receivedSamples=0;this.windows=0;this.candidates=0;this.accepted=0;this.lastTime=null;this.reasons={};this.series={rms:[],clarity:[],intervalSeconds:[],cpuMs:[],deliveryAgeMs:[],recoveryMs:[]};this.events=[];this.captureGaps=0;this.rendered=0;this.renderFrames=0;
 }
 push(samples,endFrame,deliveryAgeMs=0){
  const output=[];this.blocks++;this.receivedSamples+=samples.length;
  if(endFrame!==this.total+samples.length){this.captureGaps++;this.total=endFrame-samples.length;this.fill=0;this.at=0;this.tracker=new LiveToneTracker(this.config);this.energy=this.config.adaptiveEnergy?new AdaptiveEnergyGate(this.config):null;}
  for(const sample of samples){
   this.ring[this.at]=sample;this.at=(this.at+1)%this.ring.length;this.fill=Math.min(this.ring.length,this.fill+1);this.total++;
   if(this.fill<this.ring.length||this.total%this.hop!==0)continue;
   const start=this.now();for(let i=0;i<this.frame.length;i++)this.frame[i]=this.ring[(this.at+i)%this.ring.length];
   const frame=centerFrame(this.frame,this.centered),[candidate,clarity]=this.detector.findPitch(frame.samples,this.rate,this.limits.floor,this.limits.ceiling,CANDIDATE_THRESHOLD),time=(this.total-this.frame.length/2)/this.rate;
   const energyThreshold=this.energy?.threshold(frame.rms,clarity,frame.clipped)??this.config.minimumRms;
   const value=this.tracker.update(candidate,clarity,frame.rms,frame.clipped,time,this.limits.floor,this.limits.ceiling,energyThreshold),cpuMs=this.now()-start;
   const point={time,hz:value.hz};output.push({...point,state:value.state});
   this.windows++;if(Number.isFinite(candidate)&&candidate>0)this.candidates++;if(value.hz!==null)this.accepted++;
   if(this.diagnostic){
    this.reasons[value.reason]=(this.reasons[value.reason]||0)+1;
    if(value.confirmationKind)this.reasons['confirmation_'+value.confirmationKind]=(this.reasons['confirmation_'+value.confirmationKind]||0)+1;
    const readings={rms:frame.rms,clarity,intervalSeconds:this.lastTime===null?null:time-this.lastTime,cpuMs,deliveryAgeMs,recoveryMs:value.recoveryMs??null};
    for(const [key,v] of Object.entries(readings))if(v!==null&&Number.isFinite(v)&&this.series[key].length<6500)this.series[key].push(v);
    this.events.push({time,candidate:Number.isFinite(candidate)?candidate:null,accepted:value.hz,rms:frame.rms,clarity,reason:value.reason,confirmationKind:value.confirmationKind,energyThreshold,cpuMs});if(this.events.length>100)this.events.shift();
   }
   this.lastTime=time;
  }
  return output;
 }
 noteRender(count){this.rendered=count;this.renderFrames++;}
 report(){return {enabled:this.diagnostic,rate:this.rate,config:this.config,detector:"bounded McLeod/NSDF",searchRange:this.limits,candidateThreshold:CANDIDATE_THRESHOLD,adaptiveEnergy:this.energy?.report()??null,hopMs:this.hop/this.rate*1000,captureBlocks:this.blocks,receivedSamples:this.receivedSamples,windows:this.windows,candidates:this.candidates,accepted:this.accepted,rejections:this.reasons,captureGaps:this.captureGaps,renderFrames:this.renderFrames,acceptedPointsVisible:this.rendered,windowCenterDelayMs:this.config.size/this.rate*500,series:Object.fromEntries(Object.entries(this.series).map(([k,v])=>[k,distribution(v)])),recent:this.events};}
}
