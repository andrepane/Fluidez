// Rendering-only helpers. No audio, detector or metrics access.
export const VISUAL_DELAY=.1;
export function contiguousRuns(points,maxGap=.12){
 const runs=[];let run=[];
 for(const p of points){
  if(p.hz===null||!Number.isFinite(p.hz)||p.hz<=0){if(run.length)runs.push(run);run=[];continue;}
  if(run.length&&p.time-run.at(-1).time>maxGap){runs.push(run);run=[];}
  run.push(p);
 }
 if(run.length)runs.push(run);return runs;
}
// Monotone Hermite tangents, harmonic means; control points clamped to
// each adjacent pair's range. Never extrapolate or connect separate runs.
export function curveSegments(run){
 if(run.length<2)return [];
 const ys=run.map(p=>Math.log(p.hz)),dx=run.slice(1).map((p,i)=>p.time-run[i].time),d=dx.map((h,i)=>(ys[i+1]-ys[i])/h);
 const m=ys.map((_,i)=>i===0?d[0]:i===ys.length-1?d.at(-1):d[i-1]*d[i]<=0?0:(3*(dx[i-1]+dx[i]))/((2*dx[i]+dx[i-1])/d[i-1]+(dx[i]+2*dx[i-1])/d[i]));
 return dx.map((h,i)=>{const lo=Math.min(ys[i],ys[i+1]),hi=Math.max(ys[i],ys[i+1]),clamp=v=>Math.max(lo,Math.min(hi,v));return {from:run[i],to:run[i+1],c1:{time:run[i].time+h/3,hz:Math.exp(clamp(ys[i]+m[i]*h/3))},c2:{time:run[i+1].time-h/3,hz:Math.exp(clamp(ys[i+1]-m[i+1]*h/3))}};});
}
export class VisualClock{
 constructor(){this.reset();}
 reset(){this.audio=0;this.arrival=null;this.lastClock=0;}
 accept(audio,now){this.audio=audio;this.arrival=now;}
 at(now){if(this.arrival===null)return {clock:0,reveal:0};const elapsed=Math.max(0,(now-this.arrival)/1000),candidate=this.audio+Math.min(.12,elapsed),clock=Math.max(this.lastClock,candidate);this.lastClock=clock;return {clock,reveal:Math.max(0,Math.min(this.audio,clock-VISUAL_DELAY))};}
}
export const LIVE_WINDOW_SECONDS=5;
export const LIVE_WINDOW_OPTIONS=Object.freeze([.5,2,3,5,8,10]);
export function liveWindowSeconds(value){const n=Number(value);return LIVE_WINDOW_OPTIONS.includes(n)?n:LIVE_WINDOW_SECONDS;}
export function timeTicks(begin,end,width){
 const span=end-begin,precision=span<=.5?2:span<10?1:0;let divisions=4;
 const label=t=>`${t.toFixed(precision)} s`;
 while(divisions>1&&width/divisions<Math.max(label(begin).length,label(end).length)*7+12)divisions--;
 return Array.from({length:divisions+1},(_,i)=>({time:begin+span*i/divisions,label:label(begin+span*i/divisions),fraction:i/divisions,align:i===0?'left':i===divisions?'right':'center'}));
}
export function movingWindow(clock,seconds=LIVE_WINDOW_SECONDS){const end=Math.max(seconds,clock+Math.min(.25,seconds*.05));return {begin:end-seconds,end};}
// Presentation only: evaluate an existing limited curve at the reveal horizon.
// A null estimate terminates the marker; no extension beyond measured support.
export function revealedTip(displayed,time){
 for(const run of contiguousRuns(displayed)){
  if(time<run[0].time||time>run.at(-1).time)continue;
  if(run.length===1)return run[0];
  for(const s of curveSegments(run)){if(time<s.from.time||time>s.to.time)continue;const t=(time-s.from.time)/(s.to.time-s.from.time),u=1-t;return {time,hz:Math.exp(u**3*Math.log(s.from.hz)+3*u*u*t*Math.log(s.c1.hz)+3*u*t*t*Math.log(s.c2.hz)+t**3*Math.log(s.to.hz))};}
 }return null;
}
