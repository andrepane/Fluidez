import {countWords} from './analysis.mjs';
// A hypothesis describes one audio range, not words to append on every callback.
export class DeepgramWords {
  constructor(){this.final=new Map();this.partial=null;this.end=0;this.valid=false;}
  update(message){
    if(message.type!=='Results')return false;
    const start=message.start,end=start+message.duration,alt=message.channel?.alternatives?.[0];
    if(!Number.isFinite(start)||!Number.isFinite(end)||start<0||end<start||!alt)return false;
    const key=start.toFixed(4),words=alt.words||[],text=alt.transcript||'';
    const valid=words.every(w=>Number.isFinite(w.start)&&Number.isFinite(w.end)&&w.start>=start-.2&&w.end>=w.start&&w.end<=end+.2)
      &&words.reduce((n,w)=>n+countWords(w.word||''),0)===countWords(text);
    const segment={start,end,text,words,valid};
    if(message.is_final){this.final.set(key,segment);if(this.partial&&this.partial.start<=end+.0001)this.partial=null;}
    else if(!this.final.has(key)&&end>=this.end-.0001)this.partial=segment;
    else return false;
    this.end=Math.max(this.end,end);this.valid=valid;return true;
  }
  segments(){return [...this.final.values(),...(this.partial?[this.partial]:[])].sort((a,b)=>a.start-b.start);}
  words(){
    const fixed=[...this.final.values()].flatMap(s=>s.words);
    const extra=(this.partial?.words||[]).filter(w=>!fixed.some(f=>f.start<=((w.start+w.end)/2)&&f.end>((w.start+w.end)/2)));
    return [...fixed,...extra];
  }
  text(){return this.segments().map(s=>s.text).join(' ').trim();}
  count(){return countWords(this.text());}
  recent(runStart=0){
    const begin=Math.max(0,this.end-15,runStart),span=this.end-begin;
    if(span<3||!this.valid||this.segments().some(s=>s.end>begin&&!s.valid))return null;
    const count=this.words().filter(w=>(w.start+w.end)/2>begin&&(w.start+w.end)/2<=this.end).reduce((n,w)=>n+countWords(w.word||''),0);
    return count*60/span;
  }
}
