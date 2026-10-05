import test from 'node:test';
import assert from 'node:assert/strict';
import {LiveAudioWindow,resampleFrame,localWindowMetrics} from '../live-window.mjs';
test('bounded latest window keeps ordered samples and absolute audio times',()=>{
 const ring=new LiveAudioWindow(2,3);ring.push(Float32Array.from([0,1,2,3,4,5,6,7]));const s=ring.snapshot();
 assert.deepEqual([...s.audio],[2,3,4,5,6,7]);assert.equal(s.start,1);assert.equal(s.end,4);assert.equal(ring.data.length,6);
});
test('resampler supports actual capture rate',()=>{assert.equal(resampleFrame(new Float32Array(48000),48000).length,16000);});
test('overlapping results are measured independently and cut before resume',()=>{
 const out={text:'uno dos',chunks:[{text:'uno',timestamp:[1,2]},{text:'dos',timestamp:[6,7]}]};
 assert.equal(localWindowMetrics(out,0,8).wpm,15);assert.equal(localWindowMetrics(out,0,8,4).wpm,15);
 assert.equal(localWindowMetrics(out,2,10).wpm,15); // not additive despite overlap
 assert.equal(localWindowMetrics(out,0,8,7),null);
});
test('missing timestamps never invent a local speed',()=>{assert.equal(localWindowMetrics({text:'hola',chunks:[]},0,8),null);});
