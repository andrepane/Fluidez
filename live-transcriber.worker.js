import {pipeline,env} from 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2';
env.allowLocalModels=false;env.backends.onnx.wasm.numThreads=1;
let engine,busy=false;
self.onmessage=async({data})=>{
  if(busy){self.postMessage({type:'error',id:data.id,message:'Motor ocupado'});return;}
  busy=true;
  try{
    engine ||= await pipeline('automatic-speech-recognition','Xenova/whisper-tiny',{quantized:true,revision:'ce70c25689c3694faf5ec8206517cd53f0cfb03f',progress_callback:progress=>self.postMessage({type:'progress',progress})});
    if(data.type==='prepare'){self.postMessage({type:'ready'});return;}
    const started=performance.now();
    const output=await engine(data.audio,{language:'spanish',task:'transcribe',return_timestamps:'word',chunk_length_s:30,stride_length_s:0});
    self.postMessage({type:'result',id:data.id,output,processingMs:performance.now()-started});
  }catch(error){self.postMessage({type:'error',id:data.id,message:error.message||String(error)});}
  finally{busy=false;}
};
