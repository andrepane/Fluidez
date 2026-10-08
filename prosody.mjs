// Display helpers only: raw measurements and their original timestamps stay untouched.
export function visualPoints(points, enabled=true){
 if(!enabled)return points;
 let recent=[],previous=null;
 return points.map(p=>{
  if(p.hz===null||previous!==null&&p.time-previous>.12)recent=[];
  previous=p.time;
  if(p.hz===null)return {...p};
  recent.push(p.hz);if(recent.length>3)recent.shift();
  const sorted=[...recent].sort((a,b)=>a-b);
  return {...p,hz:sorted[Math.floor(sorted.length/2)]};
 });
}
export function referencePoints(mode,low,high,duration){
 if(mode==='free')return [];
 if(!['rising','falling','steady','varied'].includes(mode)||!Number.isFinite(low+high+duration)||low<=0||high<=low||duration<=0)throw Error('Revisa los parámetros de la guía.');
 return Array.from({length:41},(_,i)=>{const t=i/40,level=mode==='rising'?t:mode==='falling'?1-t:mode==='steady'?.5:.5-.4*Math.cos(4*Math.PI*t);return {time:t*duration,hz:low*(high/low)**level};});
}
export class AdaptiveScale{
 constructor(){this.range=null;}
 reset(){this.range=null;}
 update(target){
  if(!this.range)this.range={...target};
  else for(const k of ['low','high'])this.range[k]=Math.exp(Math.log(this.range[k])*.94+Math.log(target[k])*.06);
  return this.range;
 }
}
export function comparisonExtent(attempts){return Math.max(.1,...attempts.filter(Boolean).map(a=>a.duration));}
