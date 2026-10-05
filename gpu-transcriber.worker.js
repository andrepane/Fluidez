// Separate runtime: the established CPU worker remains unchanged apart from timing.
import { finalMetrics } from './analysis.mjs';
let engine,loading,busy=false;
self.onmessage=async({data})=>{
  if(busy){self.postMessage({id:data.id,type:'error',message:'Motor GPU ocupado'});return;}
  busy=true;const started=performance.now();let ready;
  const progress=p=>self.postMessage({id:data.id,type:'progress',progress:p});
  try{
    if(!engine){
      const adapter=await navigator.gpu?.requestAdapter();
      if(!adapter)throw Error('No hay adaptador WebGPU disponible');
      adapter.destroy?.();
      progress({status:'loading'});
      loading ||= import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1');
      const {pipeline,env}=await loading;
      env.allowLocalModels=false;env.backends.onnx.wasm.numThreads=1;
      engine=await pipeline('automatic-speech-recognition','onnx-community/whisper-base_timestamped',{
        device:'webgpu',dtype:'fp32',revision:'85322b45a808c5f17e4a70a21ea1c431b5348e62',progress_callback:progress,
      });
    }
    ready=performance.now();progress({status:'transcribing'});
    const output=await engine(data.audio,{language:'spanish',task:'transcribe',return_timestamps:'word',chunk_length_s:30,stride_length_s:5});
    const duration=data.audio.length/16000;
    // Valid format/count correspondence is necessary, not proof of ASR accuracy.
    if(!finalMetrics(output,duration,15).bins)throw Error('GPU devolvió tiempos de palabra incompletos');
    self.postMessage({id:data.id,type:'result',output,timing:{loadMs:ready-started,inferenceMs:performance.now()-ready},engine:'gpu'});
  }catch(error){
    try{await engine?.dispose();}catch{}engine=null;
    self.postMessage({id:data.id,type:'error',message:error.message||String(error)});
  }finally{busy=false;}
};
