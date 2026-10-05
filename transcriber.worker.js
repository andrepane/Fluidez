// Pinned runtime and multilingual model; all inference stays in this worker.
import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2';
env.allowLocalModels = false;
env.backends.onnx.wasm.numThreads = 1;
let transcriber;
self.onmessage = async ({data}) => {
  const started=performance.now();let ready;
  try {
    if (!transcriber) transcriber = await pipeline('automatic-speech-recognition','Xenova/whisper-base',{quantized:true,progress_callback:p=>self.postMessage({id:data.id,type:'progress',progress:p})});
    ready=performance.now();
    self.postMessage({id:data.id,type:'progress',progress:{status:'transcribing'}});
    const output = await transcriber(data.audio,{language:'spanish',task:'transcribe',return_timestamps:'word',chunk_length_s:30,stride_length_s:5});
    self.postMessage({id:data.id,type:'result',output,engine:'cpu',timing:{loadMs:ready-started,inferenceMs:performance.now()-ready}});
  } catch(error) { transcriber=null;self.postMessage({id:data.id,type:'error',message:error.message || String(error)}); }
};
