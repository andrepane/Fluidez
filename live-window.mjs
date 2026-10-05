import {countWords} from './analysis.mjs';
// Bounded, overlapping snapshots. Never concatenate their transcripts/counts.
export class LiveAudioWindow {
  constructor(rate=16000,seconds=8){this.rate=rate;this.data=new Float32Array(rate*seconds);this.total=0;}
  push(samples){for(const x of samples){this.data[this.total%this.data.length]=x;this.total++;}}
  snapshot(){const length=Math.min(this.total,this.data.length),audio=new Float32Array(length);for(let i=0;i<length;i++)audio[i]=this.data[(this.total-length+i)%this.data.length];return {audio,start:(this.total-length)/this.rate,end:this.total/this.rate};}
}
export function resampleFrame(input,from,to=16000){
  if(from===to)return input.slice();
  const output=new Float32Array(Math.round(input.length*to/from));
  for(let i=0;i<output.length;i++){const x=i*from/to,lo=Math.floor(x),f=x-lo;output[i]=input[Math.min(lo,input.length-1)]*(1-f)+input[Math.min(lo+1,input.length-1)]*f;}
  return output;
}
export function localWindowMetrics(output,start,end,runStart=0){
  const chunks=output.chunks||[],duration=end-start,words=countWords(output.text||'');
  const valid=chunks.every(c=>{const [a,b]=c.timestamp||[];return Number.isFinite(a)&&Number.isFinite(b)&&a>=0&&b>=a&&b<=duration+.2;});
  if(!valid||chunks.reduce((n,c)=>n+countWords(c.text||''),0)!==words)return null;
  const begin=Math.max(start,runStart),span=end-begin;if(span<3)return null;
  const recent=chunks.filter(c=>start+(c.timestamp[0]+c.timestamp[1])/2>=begin).reduce((n,c)=>n+countWords(c.text||''),0);
  return {wpm:recent*60/span,words:recent,span};
}
