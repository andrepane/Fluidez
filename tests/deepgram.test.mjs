import test from 'node:test';
import assert from 'node:assert/strict';
import {DeepgramWords} from '../deepgram-live.mjs';
const response=(text,words,{start=0,duration=4,final=false}={})=>({type:'Results',start,duration,is_final:final,channel:{alternatives:[{transcript:text,words:words.map(([word,start,end])=>({word,start,end}))}]}});
test('partial revisions replace words and final duplicates do not increase count',()=>{
 const t=new DeepgramWords();t.update(response('hola tú',[['hola',1,2],['tú',2,3]]));assert.equal(t.count(),2);
 t.update(response('hola yo',[['hola',1,2],['yo',2,3]]));assert.equal(t.count(),2);assert.equal(t.recent(),30);
 t.update(response('hola yo',[['hola',1,2],['yo',2,3]],{final:true}));t.update(response('hola yo',[['hola',1,2],['yo',2,3]],{final:true}));assert.equal(t.count(),2);
 t.update(response('sí',['sí'].map(w=>[w,4,5]),{start:4,duration:4}));assert.equal(t.count(),3);assert.equal(t.recent(),22.5);
});
test('word times govern recent speed and exclude pre-pause words',()=>{
 const t=new DeepgramWords();t.update(response('uno dos',[['uno',1,2],['dos',6,7]],{duration:8}));assert.equal(t.recent(4),15);assert.equal(t.recent(7),null);
});
test('missing times cannot produce speed or stale interim replace committed text',()=>{
 const t=new DeepgramWords();t.update(response('hola',[],{final:true}));assert.equal(t.recent(),null);
 assert.equal(t.update(response('hola sí',[['hola',1,2],['sí',2,3]])),false);assert.equal(t.count(),1);
});

test('PCM capture remains valid after buffer transfer and flushes its final partial frame',async()=>{
 const vm=await import('node:vm'),{readFileSync}=await import('node:fs');let Processor;const sent=[];
 class Base{constructor(){this.port={postMessage:(data,transfer)=>sent.push(structuredClone(data,{transfer}))};}}
 vm.runInNewContext(readFileSync(new URL('../deepgram-capture.worklet.js',import.meta.url),'utf8'),{AudioWorkletProcessor:Base,Int16Array,Math,registerProcessor:(_,type)=>Processor=type});
 const node=new Processor({processorOptions:{frameSize:4}});node.process([[Float32Array.from([-1,0,1,.5,0,1,-1,0,.25])]]);
 assert.equal(sent.length,2);assert.equal(sent[0].byteLength,8);assert.equal(sent[1].byteLength,8);assert.equal(new Int16Array(sent[0])[0],-32768);
 node.port.onmessage({data:'flush'});assert.equal(sent[2].type,'flushed');assert.equal(sent[2].audio.byteLength,2);
});
