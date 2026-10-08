import {Autocorrelator} from './vendor/pitchy-4.1.0.mjs';
// McLeod normalized square difference; use only periods inside the configured
// search range. Late peaks supported by very few samples must not choose F0.
export class BoundedPitchDetector {
 constructor(size){this.correlation=Autocorrelator.forFloat32Array(size);this.ac=new Float32Array(size);this.nsdf=new Float32Array(size);}
 findPitch(samples,rate,floor,ceiling,relativeThreshold=.98){
  this.correlation.autocorrelate(samples,this.ac);
  let denominator=2*this.ac[0];
  for(let lag=0;lag<samples.length;lag++){
   this.nsdf[lag]=denominator>0?2*this.ac[lag]/denominator:0;
   denominator-=samples[lag]**2+samples[samples.length-lag-1]**2;
  }
  const min=Math.max(1,Math.floor(rate/ceiling)-1),max=Math.min(samples.length-2,Math.ceil(rate/floor)+1),peaks=[];
  // Skip the zero-lag positive lobe: it is not a periodicity candidate.
  let inLobe=false,best=-1;
  for(let lag=1;lag<=max+1;lag++){
   if(this.nsdf[lag-1]<=0&&this.nsdf[lag]>0){inLobe=true;best=lag;}
   else if(inLobe&&this.nsdf[lag]>this.nsdf[best])best=lag;
   if(inLobe&&(this.nsdf[lag]<=0||lag===max+1)){
    if(best>=min&&best<=max&&this.nsdf[best]>=this.nsdf[best-1]&&this.nsdf[best]>=this.nsdf[best+1]){
     const a=this.nsdf[best-1],b=this.nsdf[best],c=this.nsdf[best+1],curvature=a-2*b+c;
     const offset=curvature===0?0:.5*(a-c)/curvature,period=best+offset,hz=rate/period;
     if(Number.isFinite(hz)&&hz>=floor&&hz<=ceiling)peaks.push({hz,clarity:Math.min(1,b-.25*(a-c)*offset)});
    }
    inLobe=false;best=-1;
   }
  }
  if(!peaks.length)return [0,0];
  const maximum=Math.max(...peaks.map(p=>p.clarity)),chosen=peaks.find(p=>p.clarity>=maximum*relativeThreshold);
  return [chosen.hz,chosen.clarity];
 }
}
