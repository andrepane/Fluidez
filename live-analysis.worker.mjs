import {LivePitchEngine} from './live-pitch.mjs';
import {SpectralEngine,SPECTRAL_CONFIG} from './spectrogram.mjs';
// DSP runs in a dedicated worker, never on the audio rendering thread.
export class LiveAnalysisProcessor{
 init(rate,limits,options){this.pitch=new LivePitchEngine(rate,limits,options);this.spectrum=new SpectralEngine(rate,SPECTRAL_CONFIG,{retain:false});this.lastReport=0;return this.pitch.report();}
 audio(data){const samples=new Float32Array(data.audio),points=this.pitch.push(samples,data.endFrame,data.deliveryAgeMs),columns=this.spectrum.push(samples,data.endFrame),now=performance.now(),report=this.pitch.diagnostic&&now-this.lastReport>=500?this.pitch.report():null;if(report)this.lastReport=now;return {points,columns,report,endFrame:data.endFrame,capturedAt:data.capturedAt,deliveryAgeMs:data.deliveryAgeMs};}
 report(){return {...this.pitch.report(),spectrum:this.spectrum.report()};}
}
if(typeof self!=='undefined'&&typeof self.postMessage==='function'){
 const processor=new LiveAnalysisProcessor();self.onmessage=({data})=>{try{
  if(data.type==='init')self.postMessage({type:'ready',report:processor.init(data.rate,data.limits,data.options)});
  else if(data.type==='audio'){const result=processor.audio(data);self.postMessage({type:'result',...result},result.columns.map(c=>c.values.buffer));}
  else if(data.type==='flush')self.postMessage({type:'flushed',report:processor.report()});
 }catch(error){self.postMessage({type:'error',message:error.message||String(error)});}};
}
