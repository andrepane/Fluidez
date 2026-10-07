import { finalMetrics } from './analysis.mjs';
export const SESSION_PROVENANCE=Object.freeze({appVersion:'1.0.0-sessions',analysisVersion:'temporal-v1',finalModel:'Xenova/whisper-base',runtime:'Transformers.js 2.17.2',liveModel:'Deepgram nova-3/es'});
const MAX_AUDIO=50*1024*1024,MAX_FILE=72*1024*1024;
const fail=()=>{throw Error('Archivo de sesión inválido o incompatible. La muestra actual se conserva.');};
const finite=(n,min,max)=>Number.isFinite(n)&&n>=min&&n<=max;
function clean(data,interval){
 if(data?.format!=='fluidez-session'||data.version!==1)fail();
 const goal=data.target;if(!goal||!finite(goal.min,1,1000)||!finite(goal.max,1,1000)||goal.max<=goal.min)fail();
 if(!['conversation','reading','description','custom'].includes(data.task))fail();
 const provenance=data.provenance;
 if(!provenance||['appVersion','analysisVersion','finalModel','runtime','liveModel'].some(k=>typeof provenance[k]!=='string'||provenance[k].length>120))fail();
 if(provenance.analysisVersion!=='temporal-v1')throw Error('Esta sesión usa una versión de análisis no compatible. La muestra actual se conserva.');
 let result=null;
 if(data.result){
  const {duration,activity,output}=data.result;
  if(!finite(duration,.001,1800)||typeof output?.text!=='string'||output.text.length>200000)fail();
  if(output.chunks!=null&&(!Array.isArray(output.chunks)||output.chunks.length>20000))fail();
  const chunks=output.chunks?.map(c=>{if(typeof c?.text!=='string'||c.text.length>1000)fail();if(c.timestamp!=null&&(!Array.isArray(c.timestamp)||c.timestamp.length!==2||c.timestamp.some(t=>t!==null&&!finite(t,0,duration+.2))))fail();return {text:c.text,timestamp:c.timestamp??null};})??[];
  if(!activity||!finite(activity.speech,0,duration)||!finite(activity.silence,0,duration)||Math.abs(activity.speech+activity.silence-duration)>.1||!finite(activity.threshold,0,1)||!Array.isArray(activity.pauses)||activity.pauses.length>10000)fail();
  let end=0;const pauses=activity.pauses.map(p=>{if(!finite(p.start,end,duration)||!finite(p.end,p.start,duration)||!finite(p.duration,.499,duration)||Math.abs(p.end-p.start-p.duration)>.001)fail();end=p.end;return {start:p.start,end:p.end,duration:p.duration};});
  const cleaned={text:output.text,chunks};result={duration,activity:{speech:activity.speech,silence:activity.silence,threshold:activity.threshold,pauses},output:cleaned,...finalMetrics(cleaned,duration,interval)};
 }
 let provisional=null;
 if(data.provisional){const p=data.provisional;if(!finite(p.duration,.001,1800)||(p.mean!==null&&!finite(p.mean,0,100000))||!Array.isArray(p.bins)||p.bins.length>20000)fail();let end=0;const bins=p.bins.map(b=>{if(!finite(b.start,end,p.duration)||!finite(b.end,b.start,p.duration)||(b.wpm!==null&&!finite(b.wpm,0,100000)))fail();end=b.end;return {start:b.start,end:b.end,wpm:b.wpm};});provisional={duration:p.duration,mean:p.mean,bins};}
 if(!result&&!provisional)fail();
 if(typeof data.createdAt!=='string'||!Number.isFinite(Date.parse(data.createdAt)))fail();
 return {task:data.task,target:{min:goal.min,max:goal.max},result,provisional,createdAt:data.createdAt,provenance:Object.fromEntries(['appVersion','analysisVersion','finalModel','runtime','liveModel'].map(k=>[k,provenance[k]]))};
}
export async function serializeSession(sample){
 if(!sample?.blob?.size||sample.blob.size>MAX_AUDIO)throw Error('El audio debe tener entre 1 byte y 50 MB para guardar una sesión.');
 const data={format:'fluidez-session',version:1,task:sample.task||'custom',target:sample.target,result:sample.result?{duration:sample.result.duration,activity:sample.result.activity,output:sample.result.output}:null,provisional:sample.provisional||null,createdAt:sample.createdAt||new Date().toISOString(),provenance:sample.provenance||SESSION_PROVENANCE};
 clean(data,15);
 const bytes=new Uint8Array(await sample.blob.arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));
 data.audio={mime:sample.blob.type||'audio/webm',base64:btoa(binary)};
 return new Blob([JSON.stringify(data)],{type:'application/json'});
}
export async function parseSession(file,interval=15){
 if(!file?.size||file.size>MAX_FILE)throw Error('El archivo de sesión está vacío o supera 72 MB.');
 let data;try{data=JSON.parse(await file.text());}catch{fail();}
 const sample=clean(data,interval),audio=data.audio;
 if(!audio||!/^audio\/(webm|mp4|wav|x-wav|mpeg|ogg|aac|flac)(;[a-zA-Z0-9= ._-]+)?$/.test(audio.mime)||typeof audio.base64!=='string'||audio.base64.length>Math.ceil(MAX_AUDIO/3)*4||!audio.base64.length||audio.base64.length%4||!/^[A-Za-z0-9+/]*={0,2}$/.test(audio.base64))fail();
 let binary;try{binary=atob(audio.base64);}catch{fail();}if(!binary.length||binary.length>MAX_AUDIO)fail();
 const bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));sample.blob=new Blob([bytes],{type:audio.mime});return sample;
}
