import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {inflateSync} from 'node:zlib';
import {SpectralEngine,SpectralRaster} from '../spectrogram.mjs';
import {LivePitchEngine} from '../live-pitch.mjs';
import {VisualClock,movingWindow} from '../live-curve.mjs';
const signal=(rate,seconds,fn)=>Float32Array.from({length:Math.round(rate*seconds)},(_,i)=>fn(i/rate));
function feed(x,rate,parts=[Math.round(rate*.06)]){const e=new SpectralEngine(rate);for(let at=0,i=0;at<x.length;i++){const end=Math.min(x.length,at+parts[i%parts.length]);e.push(x.subarray(at,end),end);at=end;}return e;}
const peak=c=>c.values.indexOf(Math.max(...c.values));
for(const rate of [44100,48000])test('spectral tone frequency, silence, amplitude and sample clock at '+rate,()=>{
 const a=feed(signal(rate,.5,t=>.01*Math.sin(2*Math.PI*1000*t)),rate),b=feed(signal(rate,.5,t=>.1*Math.sin(2*Math.PI*1000*t)),rate);
 assert.ok(a.columns.every(c=>Math.abs((peak(c)+.5)*8000/128-1000)<70));assert.ok(b.columns[4].values[peak(b.columns[4])]>a.columns[4].values[peak(a.columns[4])]);
 assert.ok(feed(new Float32Array(rate),rate).columns.every(c=>c.values.every(v=>v===0)));
 const live=new LivePitchEngine(rate,{floor:75,ceiling:600}),x=signal(rate,.5,t=>.1*Math.sin(2*Math.PI*180*t)),p=live.push(x,x.length),s=feed(x,rate);
 assert.deepEqual(s.columns.map(c=>c.time),p.map(c=>c.time)); // exact center timestamps, no drift
});
test('rising/falling spectra follow their known frequencies',()=>{for(const sign of [1,-1]){const rate=48000,e=feed(signal(rate,1,t=>.05*Math.sin(2*Math.PI*((sign===1?400:1600)*t+sign*600*t*t))),rate);for(const c of e.columns)assert.ok(Math.abs((peak(c)+.5)*62.5-((sign===1?400:1600)+sign*1200*c.time))<100);}});
test('irregular delivery is identical, causal prefix and gap do not fabricate audio',()=>{const x=signal(48000,1,t=>.03*Math.sin(2*Math.PI*1000*t)),a=feed(x,48000),b=feed(x,48000,[17,128,2048,3041]);assert.deepEqual(a.columns,b.columns);const prefix=feed(x.subarray(0,24000),48000);assert.deepEqual(prefix.columns,a.columns.slice(0,prefix.columns.length));a.push(new Float32Array(100),60000);assert.equal(a.gaps,1);assert.equal(a.fill,100);});
test('known onset and pause share F0 window clock; noise has energy without pitch',()=>{
 const rate=48000,x=signal(rate,2,t=>t<.5||t>1.5?0:.05*Math.sin(2*Math.PI*180*t)),s=feed(x,rate),f=new LivePitchEngine(rate,{floor:75,ceiling:600}).push(x,x.length);
 assert.deepEqual(s.columns.map(c=>c.time),f.map(p=>p.time));assert.ok(s.columns.filter(c=>c.time<.45||c.time>1.55).every(c=>c.values.every(v=>v===0)));assert.ok(s.columns.filter(c=>c.time>.55&&c.time<1.45).every(c=>Math.max(...c.values)>0));
 let seed=4;const noise=signal(rate,1,()=>{seed=(1664525*seed+1013904223)>>>0;return (seed/2**32-.5)*.05;}),n=feed(noise,rate),p=new LivePitchEngine(rate,{floor:75,ceiling:600}).push(noise,noise.length);assert.ok(n.columns.every(c=>c.values.filter(v=>v>0).length>100));assert.ok(p.every(p=>p.hz===null));
});
for(const sex of ['male','female'])test('real connected reading '+sex+' preserves capture and F0, spectral activity',()=>{
 const wav=inflateSync(Buffer.from(readFileSync(new URL('./fixtures/reading-'+sex+'.wav.zlib.b64',import.meta.url),'utf8'),'base64'));let at=12,data;while(at<wav.length){const length=wav.readUInt32LE(at+4);if(wav.toString('ascii',at,at+4)==='data'){data=wav.subarray(at+8,at+8+length);break;}at+=8+length+(length%2);}const raw=Float32Array.from({length:data.length/2},(_,i)=>data.readInt16LE(i*2)/32768),x=signal(48000,raw.length/16000,t=>{const p=t*16000,i=Math.floor(p);return (raw[i]||0)*(1-(p-i))+(raw[i+1]||0)*(p-i);}),copy=x.slice();
 const baseline=new LivePitchEngine(48000,{floor:75,ceiling:600}).push(x,x.length),e=feed(x,48000),after=new LivePitchEngine(48000,{floor:75,ceiling:600}).push(x,x.length);assert.deepEqual(x,copy);assert.deepEqual(after,baseline);assert.ok(e.columns.some((c,i)=>baseline[i].hz===null&&Math.max(...c.values)>0));assert.ok(e.columns.length>260);
});
test('120-second storage bounded; raster appends only new columns and shared view clips',()=>{
 const e=feed(signal(48000,120,t=>.01*Math.sin(2*Math.PI*1000*t)),48000);assert.ok(e.columns.length<=6000);assert.ok(e.report().bytes<800000);let writes=0,draw;
 const ctx={fillRect(){},createImageData(w,h){return {data:new Uint8ClampedArray(w*h*4)};},putImageData(){writes++;}},r=new SpectralRaster(e,()=>({getContext:()=>ctx}));r.update();assert.equal(writes,e.columns.length);r.update();assert.equal(writes,e.columns.length);
 const clock=new VisualClock();clock.accept(120,1000);const visual=clock.at(1000),range=movingWindow(visual.clock),view={left:60,top:8,width:700,height:100,...range,reveal:visual.reveal};r.draw({save(){},beginPath(){},rect(){},clip(){},restore(){},drawImage(...args){draw=args;}},view);assert.ok(draw);assert.ok(draw[5]+draw[7]<=760);assert.equal(writes,e.columns.length);
 console.log('Spectral benchmark 120s:',JSON.stringify(e.report()));
});
