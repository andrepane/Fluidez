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
    setAttribute(name,value){this[name]=value;}
    load(){} pause(){this.pauseCalls++;} async play(){this.playCalls++;}
    getBoundingClientRect(){return {left:0,top:0,width:600,height:260};}
    getContext(){return new Proxy({},{get:()=>noop,set:()=>true});}
  }
  const elements=new Map();
  const document={getElementById:id=>{if(!elements.has(id))elements.set(id,new Element());return elements.get(id);},querySelector:()=>new Element(),createElement:()=>new Element(),body:{dataset:{}}};
  document.getElementById('intervalSelect').value='15';
  document.getElementById('targetMin').value='120';document.getElementById('targetMax').value='150';
  document.getElementById('presetSelect').options=['conversation','reading','description','custom'].map(value=>({value}));
  let now=10000,pending=false,pendingWorker;
  let duration=20,calls=0,output={text:'hola',chunks:[{text:'hola',timestamp:[1,2]}]},failure=false;
  class AudioContext {async decodeAudioData(){return {duration,length:16000,numberOfChannels:1,sampleRate:16000,getChannelData:()=>new Float32Array(16000)};}}
  class OfflineAudioContext {createBuffer(){return {copyToChannel:noop};}createBufferSource(){return {connect:noop,start:noop};}async startRendering(){return {getChannelData:()=>new Float32Array(16000)};}}
  class Worker {
    postMessage(data){calls++;if(pending){pendingWorker={worker:this,data};return;}queueMicrotask(()=>this.onmessage({data:failure?{id:data.id,type:'error',message:'test failure'}:{id:data.id,type:'result',output}}));}
    terminate(){}
  }
  let recognizer;
  class SpeechRecognition {constructor(){recognizer=this;}start(){}stop(){this.onend?.();}abort(){}}
  class MediaRecorder {static isTypeSupported(){return true;}constructor(){this.mimeType='audio/webm';}start(){}stop(){this.ondataavailable({data:new Blob(['audio'])});this.stopped=this.onstop();}}
  const window={AudioContext,MediaRecorder,SpeechRecognition,devicePixelRatio:1,addEventListener:noop};
  class FakeURL extends URL {static createObjectURL(){return 'blob:fixture-'+Math.random();}static revokeObjectURL(){}}
  const context={...analysis,document,window,navigator:{mediaDevices:{getUserMedia:async()=>({getTracks:()=>[{stop:noop}]})}},MediaRecorder,OfflineAudioContext,Worker,URL:FakeURL,console,performance:{now:()=>now},setTimeout,clearTimeout,setInterval,clearInterval,Float32Array,Blob,getComputedStyle:()=>({getPropertyValue:()=> '#123'})};
  let source=readFileSync(new URL('../script.js',import.meta.url),'utf8');
  source=source.replace(/^import[\s\S]*?from '\.\/analysis\.mjs';/,'').replaceAll('import.meta.url',"'http://localhost/script.js'");
  source+='\nglobalThis.app={attachAudio,analyzeFinal,selectSample,playInterval,startRecording,stopRecording,tick,recorder:()=>recorder,samples,chartLayouts,state:()=>state};';
  vm.runInNewContext(source,context);
  return {app:context.app,e:id=>document.getElementById(id),calls:()=>calls,setDuration:n=>duration=n,setOutput:o=>output=o,setFailure:b=>failure=b,setTime:n=>now=n,setPending:b=>pending=b,recognition:()=>recognizer,finish:()=>{const {worker,data}=pendingWorker;worker.onmessage({data:{id:data.id,type:'result',output}});}};
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

test('therapy recording shows provisional summary before final worker and replaces it',async()=>{
  const h=harness();h.setPending(true);await h.app.startRecording();
  assert.equal(h.app.state(),'recording');assert.equal(h.e('targetMin').disabled,true);
  h.setTime(14000);h.recognition().onresult({results:[{0:{transcript:'uno dos tres cuatro cinco seis siete ocho nueve'},isFinal:true}]});
  assert.equal(h.e('feedbackLabel').textContent,'Estás en tu objetivo');assert.equal(h.e('speedMarker').hidden,false);
  h.setTime(18000);h.app.stopRecording();
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(h.app.state(),'processing');assert.match(h.e('summarySource').textContent,/Reconocimiento en directo/);
  assert.ok(h.app.samples[0].provisional);assert.notEqual(h.e('targetPercent').textContent,'—');
  h.finish();await h.app.recorder().stopped;
  assert.equal(h.app.state(),'done');assert.match(h.e('summarySource').textContent,/Whisper/);
  assert.equal(h.e('targetMin').disabled,false);
});
test('therapy refuses invalid targets before requesting microphone',async()=>{
  const h=harness();h.e('targetMin').value='200';h.e('targetMax').value='150';await h.app.startRecording();
  assert.equal(h.app.state(),'idle');assert.match(h.e('statusText').textContent,/rango válido/);
});

test('adult presets populate targets and child mode refuses automatic adult norms',async()=>{
  const h=harness();h.e('presetSelect').value='reading';h.e('presetSelect').events.change();
  assert.equal(h.e('targetMin').value,'120');assert.equal(h.e('targetMax').value,'161');
  h.e('populationSelect').value='child';h.e('populationSelect').events.change();
  assert.equal(h.e('targetMin').value,'');assert.equal(h.e('presetSelect').value,'custom');
  assert.ok(h.e('presetSelect').options.filter(o=>o.value!=='custom').every(o=>o.disabled));
  await h.app.startRecording();assert.equal(h.app.state(),'idle');
});
test('temporal stripe has accessible labels without overlapping visible text',async()=>{
  const h=harness();h.app.attachAudio(blob());await h.app.analyzeFinal();
  assert.equal(h.e('therapyTimeline').children[0].textContent,'');
  assert.match(h.e('therapyTimeline').children[0]['aria-label'],/00:00/);
  assert.equal(h.e('therapySummary').hidden,false);
});

test('stopping and final completion never leave a live speed on the main meter',async()=>{
  const h=harness();h.setPending(true);await h.app.startRecording();h.setTime(14000);
  h.recognition().onresult({results:[{0:{transcript:'uno dos tres cuatro cinco seis siete ocho nueve'},isFinal:true}]});
  assert.equal(h.e('speedMarker').hidden,false);h.app.stopRecording();
  assert.equal(h.e('speedMarker').hidden,true);assert.equal(h.e('feedbackLabel').textContent,'Grabación terminada');
  await new Promise(resolve=>setImmediate(resolve));h.finish();await h.app.recorder().stopped;
  assert.equal(h.e('speedMarker').hidden,true);assert.equal(h.e('feedbackLabel').textContent,'Práctica terminada');
  assert.doesNotMatch(h.e('feedbackValue').textContent,/ppm estimadas/);
});
test('recognition gaps become unavailable rather than a misleading slow instruction',async()=>{
  const h=harness();await h.app.startRecording();h.setTime(14000);
  h.recognition().onresult({results:[{0:{transcript:'uno dos tres cuatro cinco seis siete ocho nueve'},isFinal:true}]});
  h.setTime(20000);h.app.tick();assert.equal(h.e('speedMarker').hidden,true);
  assert.equal(h.e('feedbackLabel').textContent,'Esperando actualización de voz');
  h.recognition().onresult({results:[{0:{transcript:'uno dos tres cuatro cinco seis siete ocho nueve diez once'},isFinal:true}]});
  assert.equal(h.e('speedMarker').hidden,false);h.app.stopRecording();await h.app.recorder().stopped;
});
