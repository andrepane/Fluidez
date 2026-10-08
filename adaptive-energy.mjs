// Optional lower energy gate for highly periodic quiet input. It does not
// modify PCM and cannot distinguish a periodic machine from a human voice.
export class AdaptiveEnergyGate {
 constructor({minimumRms=.0005,quietMinimumRms=.00005,quietClarity=.92,noiseRatio=3}={}){Object.assign(this,{minimumRms,quietMinimumRms,quietClarity,noiseRatio});this.noise=[];this.floor=quietMinimumRms/5;}
 threshold(rms,clarity,clipped){
  // Use only low-periodicity non-clipped windows for the background estimate.
  // A low quantile resists isolated knocks and phonatory transitions.
  if(clipped<=.01&&Number.isFinite(rms)&&Number.isFinite(clarity)&&clarity<.55){this.noise.push(rms);if(this.noise.length>60)this.noise.shift();const sorted=[...this.noise].sort((a,b)=>a-b);this.floor=Math.max(this.quietMinimumRms/5,sorted[Math.floor((sorted.length-1)*.2)]);}
  const quietThreshold=Math.max(this.quietMinimumRms,this.floor*this.noiseRatio);
  return clarity>=this.quietClarity?Math.min(this.minimumRms,quietThreshold):this.minimumRms;
 }
 report(){return {noiseFloorRms:this.floor,backgroundWindows:this.noise.length,quietClarity:this.quietClarity,quietMinimumRms:this.quietMinimumRms,noiseRatio:this.noiseRatio};}
}
