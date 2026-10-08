export const MAX_SECONDS=120;
export function validLimits(floor,ceiling){return Number.isFinite(floor)&&Number.isFinite(ceiling)&&floor>=50&&floor<=300&&ceiling>=150&&ceiling<=1200&&ceiling>=floor*2;}
export function summarize(points){const values=points.map(p=>p.hz).filter(v=>Number.isFinite(v)&&v>0).sort((a,b)=>a-b);const q=n=>values.length?values[Math.round((values.length-1)*n)]:null;return {median:q(.5),p10:q(.1),p90:q(.9),detected:points.length?values.length/points.length:0};}
export function wav16(samples,rate=16000){const buffer=new ArrayBuffer(44+samples.length*2),view=new DataView(buffer);const str=(o,s)=>[...s].forEach((c,i)=>view.setUint8(o+i,c.charCodeAt(0)));str(0,'RIFF');view.setUint32(4,36+samples.length*2,true);str(8,'WAVE');str(12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,rate,true);view.setUint32(28,rate*2,true);view.setUint16(32,2,true);view.setUint16(34,16,true);str(36,'data');view.setUint32(40,samples.length*2,true);samples.forEach((v,i)=>{const s=Math.max(-1,Math.min(1,v));view.setInt16(44+i*2,s<0?s*32768:s*32767,true);});return buffer;}
export function validateFinal(data){if(data?.source!=='Praat/Parselmouth'||!Array.isArray(data.points)||data.points.length>13000||!Number.isFinite(data.duration)||data.duration<=0||data.duration>MAX_SECONDS)throw Error('Respuesta de análisis no válida.');let last=-1;for(const p of data.points){if(!Number.isFinite(p.time)||p.time<=last||p.time<0||p.time>data.duration||!(p.hz===null||(Number.isFinite(p.hz)&&p.hz>=50&&p.hz<=1200)))throw Error('Curva final no válida.');if(p.periodicity!==undefined&&(!Number.isFinite(p.periodicity)||p.periodicity<0||p.periodicity>1))throw Error('Periodicidad final no válida.');last=p.time;}return data;}

// A stricter candidate selector avoids some strong-harmonic errors; it is not
// a calibrated probability of correctness.
export const CANDIDATE_THRESHOLD=.98;
export function centerFrame(input, output=new Float32Array(input.length)) {
 let mean=0,clipped=0;for(const v of input){mean+=v;if(Math.abs(v)>=.99)clipped++;}mean/=input.length;
 let sum=0;for(let i=0;i<input.length;i++){output[i]=input[i]-mean;sum+=output[i]**2;}
 return {samples:output,rms:Math.sqrt(sum/input.length),clipped:clipped/input.length};
}
export class LiveToneTracker {
 constructor({minimumClarity=.95,minimumRms=.002}={}){this.minimumClarity=minimumClarity;this.minimumRms=minimumRms;this.previous=null;this.pending=null;this.lastTime=-1;}
 update(hz,clarity,rms,clipped,time,floor,ceiling){
  if(time-this.lastTime>.25){this.previous=null;this.pending=null;}this.lastTime=time;
  const reject=state=>{this.pending=null;this.previous=null;return {hz:null,state,reason:state==='Entrada al límite digital'?'digital_limit':state==='Señal muy débil o silencio'?'low_energy':state==='Fuera del rango de búsqueda'?'range':'periodicity'};};
  if(clipped>.01)return reject('Entrada al límite digital');
  if(rms<this.minimumRms)return reject('Señal muy débil o silencio');
  if(!Number.isFinite(hz)||hz<=0||clarity<this.minimumClarity)return reject('Tono no estimable');
  if(hz<floor||hz>ceiling)return reject('Fuera del rango de búsqueda');
  const jump=this.previous===null||Math.abs(12*Math.log2(hz/this.previous))>7;
  if(jump){
   if(this.pending&&Math.abs(12*Math.log2(hz/this.pending))<2){this.previous=hz;this.pending=null;return {hz,state:'Tono estimado',reason:'accepted'};}
   this.pending=hz;return {hz:null,state:'Confirmando tono',reason:'confirmation'};
  }
  this.previous=hz;this.pending=null;return {hz,state:'Tono estimado',reason:'accepted'};
 }
}
export function plotRange(points,floor,ceiling){const voiced=points.filter(p=>p.hz!==null&&Number.isFinite(p.hz)).map(p=>p.hz);if(!voiced.length)return {low:floor,high:ceiling};return {low:Math.max(floor,Math.min(...voiced)/1.25),high:Math.min(ceiling,Math.max(...voiced)*1.25)};}
export function timeAtX(x,width,duration,left=60,right=20){return Math.max(0,Math.min(duration,(x-left)/(width-left-right)*duration));}
export function nearestPoint(points,time){let lo=0,hi=points.length;while(lo<hi){const mid=(lo+hi)>>1;if(points[mid].time<time)lo=mid+1;else hi=mid;}const a=points[lo-1],b=points[lo];if(!a)return b;if(!b)return a;return time-a.time<=b.time-time?a:b;}
