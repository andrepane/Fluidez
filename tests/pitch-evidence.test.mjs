import test from 'node:test';
import assert from 'node:assert/strict';
import {LivePitchEngine,LIVE_CONFIG} from '../live-pitch.mjs';
import {PitchEvidenceFilter} from '../pitch-evidence-filter.mjs';
const tone=(rate,hz,noise=0)=>{let seed=87;return Float32Array.from({length:rate},(_,i)=>{seed=(1664525*seed+1013904223)>>>0;const t=i/rate;return .03*Math.sin(2*Math.PI*hz*t)+.07*Math.sin(4*Math.PI*hz*t)+.04*Math.sin(6*Math.PI*hz*t)+(seed/2**32-.5)*noise;});};
function run(x,rate,filteredEvidence){const e=new LivePitchEngine(rate,{floor:50,ceiling:1000},{config:{...LIVE_CONFIG,filteredEvidence},diagnostic:true}),p=e.push(x,x.length).filter(p=>p.time>.15&&p.time<.85);return {e,p,v:p.filter(p=>p.hz!==null)};}
for(const rate of [44100,48000])for(const hz of [55,60,80,100,150,350,700,950])test('clean fundamental with dominant second/third harmonics '+hz+' Hz at '+rate,()=>{const x=tone(rate,hz),copy=x.slice(),{p,v}=run(x,rate,true);assert.ok(v.length/p.length>.95);assert.ok(v.every(p=>Math.abs(1200*Math.log2(p.hz/hz))<20));assert.deepEqual(x,copy);});
for(const hz of [60,80,100,150,350,700])test('filtered evidence recovers noisy harmonic voice '+hz+' Hz without invented harmonics',()=>{const x=tone(48000,hz,.12),raw=run(x,48000,false),next=run(x,48000,true);assert.ok(next.v.length/next.p.length>.7);assert.ok(next.v.length>raw.v.length);assert.ok(next.v.every(p=>Math.abs(1200*Math.log2(p.hz/hz))<20));assert.ok(next.e.report().recent.some(p=>p.evidence==='filtered'));});
test('filter buffers are reused, PCM unchanged and silence stays silent',()=>{const f=new PitchEvidenceFilter(2048,48000),x=new Float32Array(2048),copy=x.slice();const a=f.process(x),b=f.process(x);assert.equal(a,b);assert.ok(a.every(v=>v===0));assert.deepEqual(x,copy);});
test('5 ms stream never fills a true silence between harmonic vowels',()=>{const x=tone(48000,80,.12);x.fill(0,16000,32000);const {p}=run(x,48000,true);assert.ok(p.filter(p=>p.time>.4&&p.time<.6).every(p=>p.hz===null));});
