export const countWords = text => (text.match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu) || []).length;
export const formatTime = seconds => { const n = Math.max(0, Math.round(seconds)); return `${Math.floor(n/60).toString().padStart(2,'0')}:${(n%60).toString().padStart(2,'0')}`; };
export function wordSegments(chunks, duration, width=15) {
  if (!Number.isFinite(duration) || duration <= 0 || !Number.isFinite(width) || width <= 0) throw new Error('Duración o intervalo inválido');
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

// SpeechRecognition supplies no acoustic word timestamps. These are receipt times,
// used only for provisional recent speed; revisions retain the unchanged prefix.
export class LiveWordTracker {
  constructor() { this.entries = []; }
  update(text, time) {
    const tokens = text.match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu) || [];
    let prefix = 0;
    while (prefix < tokens.length && prefix < this.entries.length &&
      tokens[prefix].toLowerCase() === this.entries[prefix].word.toLowerCase()) prefix++;
    this.entries.length = prefix;
    for (const word of tokens.slice(prefix)) this.entries.push({ word, time });
  }
  recent(time, elapsed, window = 15) {
    const span = Math.min(window, elapsed);
    if (span < 3) return null;
    const words = this.entries.filter(e => e.time > Math.max(time - window, time - elapsed) && e.time <= time).length;
    return words * 60 / span;
  }
}
export function finalMetrics(output, duration, interval = 15) {
  const words = countWords(output.text || '');
  const temporal = wordSegments(output.chunks, duration, interval);
  const assigned = temporal.bins.reduce((sum, b) => sum + b.words, 0);
  // Missing chunks for a nonempty transcript must never become zero-speed bins.
  return { words, mean: words * 60 / duration,
    bins: !temporal.untimed && assigned === words ? temporal.bins : null };
}
export function sharedChartScale(results) {
  const valid = results.filter(Boolean);
  return { duration: Math.max(1, ...valid.map(r => r.duration)),
    max: Math.max(60, ...valid.flatMap(r => [r.mean, ...(r.bins || []).map(b => b.wpm)])) * 1.2 };
}
export function intervalAt(time, bins) {
  return bins?.find(b => time >= b.start && time < b.end) || null;
}

export function speedZone(wpm, target) {
  if (!Number.isFinite(wpm)) return 'unknown';
  return wpm < target.min ? 'slow' : wpm > target.max ? 'fast' : 'target';
}
export function therapySummary(bins, duration, target) {
  const seconds = {slow:0,target:0,fast:0,unknown:0};
  let longest=0, run=0, previousEnd=0;
  const timeline=(bins || []).map(b=>({...b,zone:speedZone(b.wpm,target)}));
  for (const b of timeline) {
    const span=b.end-b.start;
    seconds[b.zone]+=span;
    run=b.zone==='target' ? (Math.abs(b.start-previousEnd)<.001 ? run : 0)+span : 0;
    longest=Math.max(longest,run); previousEnd=b.end;
  }
  seconds.unknown+=Math.max(0,duration-Object.values(seconds).reduce((a,b)=>a+b,0));
  return {timeline,seconds,longest,percent:Object.fromEntries(Object.entries(seconds).map(([k,v])=>[k,duration>0?v/duration*100:0]))};
}

// Carlo (2007), Table 5, communication rate P10–P90 rounded to whole ppm.
// Descriptive adult sample reference, NOT diagnostic limits or pediatric norms.
export const therapyPresets = {
  conversation:{min:120,max:187,label:'Conversación'},
  reading:{min:120,max:161,label:'Lectura'},
  description:{min:67,max:158,label:'Descripción de imágenes'}
};

// Conservative low-energy gate, not a validated voice activity detector.
// It only suppresses instructions; never supplies an articulation-rate denominator.
export class PauseGate {
  constructor(){this.lowSince=null;this.paused=false;}
  update(rms,time){
    if(!Number.isFinite(rms)||!Number.isFinite(time))return {paused:false,resumed:false};
    const was=this.paused;
    if(rms<.006){this.lowSince ??= time;if(time-this.lowSince>=.8)this.paused=true;}
    else if(rms>.009){this.lowSince=null;this.paused=false;}
    return {paused:this.paused,resumed:was&&!this.paused};
  }
}
