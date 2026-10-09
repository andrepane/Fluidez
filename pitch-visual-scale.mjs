// Display only. Never modifies F0, timestamps, detector limits or final analysis.
export const semitones=(hz,reference)=>12*Math.log2(hz/reference);
export const frequency=(st,reference)=>reference*2**(st/12);
export function visualRange(points,{floor=50,ceiling=1000}={},robust=false){
 const values=points.map(p=>p.hz).filter(v=>Number.isFinite(v)&&v>0).sort((a,b)=>a-b);
 if(!values.length)return {low:floor,high:ceiling,reference:Math.sqrt(floor*ceiling),calibrated:false};
 const q=p=>values[Math.round((values.length-1)*p)],reference=q(.5),lo=semitones(robust?q(.1):values[0],reference),hi=semitones(robust?q(.9):values.at(-1),reference),span=Math.max(12,hi-lo+4),center=(lo+hi)/2;
 return {low:frequency(center-span/2,reference),high:frequency(center+span/2,reference),reference,calibrated:true};
}
export class StablePitchScale{
 constructor(){this.reset();}
 reset(){this.samples=[];this.first=null;this.last=-Infinity;this.range=null;this.locked=false;}
 observe(points,limits){if(this.locked)return;for(const p of points){if(p.time<=this.last)continue;this.last=p.time;if(!Number.isFinite(p.hz)||p.hz<=0)continue;if(this.first===null)this.first=p.time;this.samples.push(p);if(this.samples.length>=20&&p.time-this.first>=1.5){this.locked=true;break;}}if(this.samples.length)this.range=visualRange(this.samples,limits,true);}
 get(limits){return this.range||visualRange([],limits);}
}
export function visualTicks(range){const lo=semitones(range.low,range.reference),hi=semitones(range.high,range.reference),step=hi-lo<=18?3:hi-lo<=36?6:12,ticks=[];for(let st=Math.ceil(lo/step)*step;st<=hi+1e-8;st+=step)ticks.push({st,hz:frequency(st,range.reference),label:(st>0?'+':'')+st+' st'});return ticks;}
