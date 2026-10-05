export const countWords = text => (text.match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu) || []).length;
export const formatTime = seconds => { const n = Math.max(0, Math.round(seconds)); return `${Math.floor(n/60).toString().padStart(2,'0')}:${(n%60).toString().padStart(2,'0')}`; };
export function wordSegments(chunks, duration, width=30) {
  const bins = Array.from({length:Math.ceil(duration/width)},(_,i)=>({start:i*width,end:Math.min(duration,(i+1)*width),words:0}));
  let untimed=0;
  for (const chunk of chunks || []) {
    const n=countWords(chunk.text || ''); if (!n) continue;
    const [start,end]=chunk.timestamp || [];
    if (!Number.isFinite(start) || !Number.isFinite(end) || start<0 || end<start || end>duration+0.2) { untimed+=n; continue; }
    const midpoint=Math.min(duration-Number.EPSILON,(start+end)/2);
    const bin=bins[Math.min(bins.length-1,Math.floor(midpoint/width))];
    if(bin) bin.words+=n; else untimed+=n;
  }
  return {bins:bins.map(b=>({...b,wpm:b.words*60/(b.end-b.start)})),untimed};
}
// Energy-based estimate only. Fixed 20 ms frames; no transcript gaps are used.
export function acousticActivity(samples, sampleRate) {
  const size=Math.max(1,Math.round(sampleRate*.02)); const frames=[];
  for(let i=0;i<samples.length;i+=size){let sum=0;const end=Math.min(samples.length,i+size);for(let j=i;j<end;j++)sum+=samples[j]*samples[j];frames.push({start:i/sampleRate,end:end/sampleRate,rms:Math.sqrt(sum/(end-i))});}
  if(!frames.length)return {speech:0,silence:0,pauses:[],threshold:0};
  const levels=frames.map(f=>f.rms).sort((a,b)=>a-b);
  const noise=levels[Math.floor((levels.length-1)*.1)]; const high=levels[Math.floor((levels.length-1)*.95)];
  const threshold=Math.max(.003,Math.min(noise*3,high*.25));
  const active=frames.map(f=>f.rms>threshold);
  // Bridge gaps shorter than 150 ms surrounded by activity.
  for(let i=0;i<active.length;){if(active[i]){i++;continue;}const start=i;while(i<active.length&&!active[i])i++;if(start>0&&i<active.length&&frames[i-1].end-frames[start].start<.15)active.fill(true,start,i);}
  let speech=0;const pauses=[];
  for(let i=0;i<frames.length;){if(active[i]){speech+=frames[i].end-frames[i].start;i++;continue;}const start=i;while(i<frames.length&&!active[i])i++;const end=frames[i-1].end;const begin=frames[start].start;if(start>0&&i<frames.length&&end-begin>=.5-1e-8)pauses.push({start:begin,end,duration:end-begin});}
  return {speech,silence:samples.length/sampleRate-speech,pauses,threshold};
}
