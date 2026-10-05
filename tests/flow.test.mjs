import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import * as analysis from '../analysis.mjs';

// Deterministic browser adapters exercise the actual app script. No fake inference
// is shipped in the product; these tests verify wiring, not ASR accuracy.
function harness() {
  const noop=()=>{};
  class Element {
    constructor(){this.children=[];this.events={};this.dataset={};this.style={};this.value='';this.textContent='';this.currentTime=0;this.clientWidth=600;this.playCalls=0;this.pauseCalls=0;this.classList={toggle:noop};}
    addEventListener(name,fn){this.events[name]=fn;}
    append(...nodes){this.children.push(...nodes);}
    replaceChildren(...nodes){this.children=nodes;}
    removeAttribute(name){delete this[name];}
    load(){} pause(){this.pauseCalls++;} async play(){this.playCalls++;}
    getBoundingClientRect(){return {left:0,top:0,width:600,height:260};}
    getContext(){return new Proxy({},{get:()=>noop,set:()=>true});}
  }
  const elements=new Map();
  const document={getElementById:id=>{if(!elements.has(id))elements.set(id,new Element());return elements.get(id);},createElement:()=>new Element(),body:{dataset:{}}};
  document.getElementById('intervalSelect').value='15';
  let duration=20,calls=0,output={text:'hola',chunks:[{text:'hola',timestamp:[1,2]}]},failure=false;
  class AudioContext {async decodeAudioData(){return {duration,length:16000,numberOfChannels:1,sampleRate:16000,getChannelData:()=>new Float32Array(16000)};}}
  class OfflineAudioContext {createBuffer(){return {copyToChannel:noop};}createBufferSource(){return {connect:noop,start:noop};}async startRendering(){return {getChannelData:()=>new Float32Array(16000)};}}
  class Worker {
    postMessage(data){calls++;queueMicrotask(()=>this.onmessage({data:failure?{id:data.id,type:'error',message:'test failure'}:{id:data.id,type:'result',output}}));}
    terminate(){}
  }
  const window={AudioContext,devicePixelRatio:1,addEventListener:noop};
  class FakeURL extends URL {static createObjectURL(){return 'blob:fixture-'+Math.random();}static revokeObjectURL(){}}
  const context={...analysis,document,window,navigator:{},OfflineAudioContext,Worker,URL:FakeURL,console,performance:{now:()=>10000},setTimeout,clearTimeout,setInterval,clearInterval,Float32Array,Blob,getComputedStyle:()=>({getPropertyValue:()=> '#123'})};
  let source=readFileSync(new URL('../script.js',import.meta.url),'utf8');
  source=source.replace(/^import[\s\S]*?from '\.\/analysis\.mjs';/,'').replaceAll('import.meta.url',"'http://localhost/script.js'");
  source+='\nglobalThis.app={attachAudio,analyzeFinal,selectSample,playInterval,startRecording,stopRecording,samples,chartLayouts,state:()=>state};';
  vm.runInNewContext(source,context);
  return {app:context.app,e:id=>document.getElementById(id),calls:()=>calls,setDuration:n=>duration=n,setOutput:o=>output=o,setFailure:b=>failure=b};
}
const blob=()=>new Blob([new Uint8Array(10)],{type:'audio/wav'});
test('zero activity still invokes final worker and never reuses live text',async()=>{
  const h=harness();h.e('liveTranscript').textContent='old live transcript';h.app.attachAudio(blob());await h.app.analyzeFinal();
  assert.equal(h.calls(),1);assert.equal(h.app.samples[0].result.activity.speech,0);assert.equal(h.e('wordCount').textContent,'1');assert.equal(h.e('finalTranscript').textContent,'hola');assert.match(h.e('finalNotice').textContent,/Whisper reconoció palabras/);
});
test('two samples retain independent audio and shared comparison axes',async()=>{
  const h=harness();h.app.attachAudio(blob());await h.app.analyzeFinal();const urlA=h.app.samples[0].url;
  h.app.selectSample(1);h.setDuration(40);h.setOutput({text:'hola sí',chunks:[{text:'hola',timestamp:[1,2]},{text:'sí',timestamp:[30,31]}]});h.app.attachAudio(blob());await h.app.analyzeFinal();
  assert.equal(h.app.samples[0].url,urlA);assert.equal(h.app.samples[0].result.words,1);assert.equal(h.app.samples[1].result.words,2);
  assert.equal(h.app.chartLayouts.get('chartA').duration,40);assert.equal(h.app.chartLayouts.get('chartB').duration,40);
  h.e('intervalSelect').value='10';h.e('intervalSelect').events.change();assert.equal(h.app.samples[0].result.bins.length,2);assert.equal(h.app.samples[1].result.bins.length,4);assert.equal(h.calls(),2);
});
test('clicking a comparison interval selects correct audio and stops at end',async()=>{
  const h=harness();h.app.attachAudio(blob());await h.app.analyzeFinal();h.app.selectSample(1);h.app.attachAudio(blob());await h.app.analyzeFinal();
  const bin=h.app.samples[0].result.bins[1];await h.app.playInterval(0,bin);
  assert.equal(h.e('sampleSelect').value,'0');assert.equal(h.e('playback').src,h.app.samples[0].url);assert.equal(h.e('playback').currentTime,15);assert.equal(h.e('playback').playCalls,1);
  const before=h.e('playback').pauseCalls;h.e('playback').currentTime=20;h.e('playback').events.timeupdate();assert.equal(h.e('playback').pauseCalls,before+1);
});
test('worker failure exposes incomplete analysis and preserves audio',async()=>{
  const h=harness();h.app.attachAudio(blob());h.setFailure(true);await h.app.analyzeFinal();
  assert.equal(h.app.state(),'error');assert.equal(h.app.samples[0].result,null);assert.equal(h.e('analysisTag').textContent,'Análisis final incompleto');assert.ok(h.app.samples[0].blob);assert.equal(h.e('retryBtn').disabled,false);
});
test('incomplete word timestamps keep mean but suppress temporal graph',async()=>{
  const h=harness();h.setOutput({text:'hola sí',chunks:[{text:'hola',timestamp:[1,2]}]});h.app.attachAudio(blob());await h.app.analyzeFinal();
  assert.equal(h.app.samples[0].result.bins,null);assert.equal(h.e('wpm').textContent,'6 ppm');assert.equal(h.app.chartLayouts.has('speedChart'),false);
});
