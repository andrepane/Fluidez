// One in-flight block; bounded pending history. Audio recording is independent.
export class LiveAnalysisClient{
 constructor({createWorker=()=>new Worker(new URL('./live-analysis.worker.mjs',import.meta.url),{type:'module'}),onresult=()=>{},onerror=()=>{},now=()=>performance.now()}={}){this.createWorker=createWorker;this.onresult=onresult;this.onerror=onerror;this.now=now;this.pending=[];this.inFlight=false;this.closed=false;this.failed=false;this.skipped=0;this.renderFrames=0;this.acceptedPointsVisible=0;this.snapshot={};}
 async init(rate,limits,{diagnostic=false,engine='current'}={}){
  this.diagnostic=diagnostic;this.rate=rate;this.worker=this.createWorker();this.worker.onmessage=({data})=>this.receive(data);this.worker.onerror=e=>{e.preventDefault?.();this.fail(Error('El procesamiento en directo no está disponible. Conservamos la grabación.'));};
  return new Promise((resolve,reject)=>{this.ready={resolve,reject};this.initTimer=setTimeout(()=>this.fail(Error('No se pudo iniciar el análisis en directo.')),5000);try{this.worker.postMessage({type:'init',rate,limits,options:{diagnostic,engine}});}catch(e){this.fail(e);}});
 }
 push(samples,endFrame,deliveryAgeMs=0){if(this.closed||this.failed)return;this.pending.push({samples,endFrame,deliveryAgeMs,capturedAt:this.now()});if(this.pending.length>6){this.pending.shift();this.skipped++;}this.pump();}
 pump(){if(this.inFlight||this.closed||this.failed)return;const next=this.pending.shift();if(next){this.inFlight=true;const audio=next.samples.slice().buffer;try{this.worker.postMessage({type:'audio',audio,endFrame:next.endFrame,deliveryAgeMs:next.deliveryAgeMs,capturedAt:next.capturedAt},[audio]);}catch(e){this.fail(e);}}else if(this.drain&&!this.flushSent){this.flushSent=true;try{this.worker.postMessage({type:'flush'});}catch(e){this.fail(e);}}}
 receive(data){if(this.closed||this.failed)return;
  if(data.type==='ready'){clearTimeout(this.initTimer);this.snapshot=data.report;this.ready?.resolve();this.ready=null;}
  else if(data.type==='result'){this.inFlight=false;if(data.report)this.snapshot=data.report;this.onresult({...data,ageMs:data.deliveryAgeMs+Math.max(0,this.now()-data.capturedAt)});this.pump();}
  else if(data.type==='flushed'){this.snapshot=data.report;clearTimeout(this.flushTimer);this.drain?.resolve();this.drain=null;this.flushSent=false;}
  else if(data.type==='error')this.fail(Error(data.message));
 }
 flush(){if(this.failed||this.closed)return Promise.reject(Error('No se completó el directo. El audio se conserva.'));return new Promise((resolve,reject)=>{this.drain={resolve,reject};this.flushTimer=setTimeout(()=>this.fail(Error('El directo no terminó a tiempo. El audio se conserva.')),3000);this.pump();});}
 fail(error){if(this.failed||this.closed)return;this.failed=true;clearTimeout(this.initTimer);clearTimeout(this.flushTimer);this.ready?.reject(error);this.ready=null;this.drain?.reject(error);this.drain=null;this.pending=[];this.worker?.terminate();this.onerror(error);}
 noteRender(count){this.renderFrames++;this.acceptedPointsVisible=count;}
 report(){return {...this.snapshot,worker:true,skippedAnalysisBlocks:this.skipped,pendingBlocks:this.pending.length,renderFrames:this.renderFrames,acceptedPointsVisible:this.acceptedPointsVisible};}
 close(){if(this.closed)return;this.closed=true;clearTimeout(this.initTimer);clearTimeout(this.flushTimer);this.worker?.terminate();this.pending=[];this.ready?.reject(Error('Análisis cancelado'));this.drain?.reject(Error('Análisis cancelado'));this.ready=null;this.drain=null;}
}
