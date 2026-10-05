import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {finalMetrics} from '../analysis.mjs';
async function run(output){
 const messages=[],calls=[];const inference=async(audio,options)=>{calls.push(options);return output;};inference.dispose=async()=>{};
 const context={finalMetrics,Float32Array,performance:{now:()=>0},navigator:{gpu:{requestAdapter:async()=>({})}},self:{postMessage:m=>messages.push(m)},runtime:{env:{backends:{onnx:{wasm:{}}}},pipeline:async(...args)=>{calls.push(args);return inference;}}};
 const source=readFileSync(new URL('../gpu-transcriber.worker.js',import.meta.url),'utf8').replace(/^import .*;$/m,'').replace("import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1')",'Promise.resolve(runtime)');
 vm.runInNewContext(source,context);await context.self.onmessage({data:{id:1,audio:new Float32Array(16000*10)}});return {messages,calls};
}
test('GPU requests Spanish word timestamps and uses full precision pinned Base',async()=>{
 const {messages,calls}=await run({text:'hola',chunks:[{text:'hola',timestamp:[1,2]}]});
 assert.equal(calls[0][1],'onnx-community/whisper-base_timestamped');assert.equal(calls[0][2].dtype,'fp32');
 assert.equal(calls[1].return_timestamps,'word');assert.equal(calls[1].language,'spanish');assert.equal(calls[1].stride_length_s,5);
 assert.equal(messages.at(-1).type,'result');assert.equal(messages.at(-1).engine,'gpu');
});
test('GPU rejects missing timestamps instead of returning invented temporal data',async()=>{
 const {messages}=await run({text:'hola',chunks:[]});assert.equal(messages.at(-1).type,'error');assert.match(messages.at(-1).message,/tiempos de palabra/);
});
