// Experimental local YIN: fixed-support squared difference, CMNDF, first
// threshold minimum and parabolic refinement. No network or learned model.
export class YinPitchDetector {
 constructor(size){this.size=size;this.signal=new Float64Array(size);this.difference=new Float64Array(size);this.cmnd=new Float64Array(size);this.lastRate=0;}
 prepare(samples,rate){const factor=Math.max(1,Math.ceil(rate/16000));if(this.lastRate!==rate){this.lastRate=rate;this.factor=factor;const cutoff=.4/factor;this.taps=Float64Array.from({length:31},(_,i)=>{const x=i-15;return (x===0?2*cutoff:Math.sin(2*Math.PI*cutoff*x)/(Math.PI*x))*(.42-.5*Math.cos(2*Math.PI*i/30)+.08*Math.cos(4*Math.PI*i/30));});const sum=this.taps.reduce((a,b)=>a+b,0);this.taps=this.taps.map(x=>x/sum);}
  const length=Math.ceil(samples.length/factor);for(let j=0;j<length;j++){let v=0;for(let k=0;k<31;k++)v+=this.taps[k]*samples[Math.max(0,Math.min(samples.length-1,j*factor+k-15))];this.signal[j]=v;}return {length,rate:rate/factor};}
 findPitch(samples,rate,floor,ceiling){const down=this.prepare(samples,rate),n=down.length,r=down.rate,max=Math.min(Math.ceil(r/floor)+1,Math.floor(n/2)-1),min=Math.max(2,Math.floor(r/ceiling)-1),width=n-max-1;if(max<=min||width<16)return [0,0];let sum=0;this.cmnd[0]=1;
  for(let lag=1;lag<=max;lag++){let d=0;for(let i=0;i<width;i++){const delta=this.signal[i]-this.signal[i+lag];d+=delta*delta;}this.difference[lag]=d;sum+=d;this.cmnd[lag]=sum>1e-20?d*lag/sum:1;}
  for(let lag=min;lag<max;lag++){if(this.cmnd[lag]>=.15)continue;while(lag+1<max&&this.cmnd[lag+1]<this.cmnd[lag])lag++;const a=this.cmnd[lag-1],b=this.cmnd[lag],c=this.cmnd[lag+1],den=a-2*b+c,offset=den===0?0:Math.max(-1,Math.min(1,.5*(a-c)/den)),hz=r/(lag+offset);if(Number.isFinite(hz)&&hz>=floor&&hz<=ceiling)return [hz,Math.max(0,Math.min(1,1-b))];}
  return [0,0];
 }
}
