import test from 'node:test';import assert from 'node:assert/strict';import {countWords,formatTime,wordSegments,acousticActivity} from '../analysis.mjs';
test('Spanish punctuation and accents',()=>assert.equal(countWords('¡Hoy, yo… yo quiero ir!'),5));
test('time rolls over correctly',()=>assert.equal(formatTime(59.8),'01:00'));
test('word boundaries and partial final interval',()=>{const r=wordSegments([{text:'hola',timestamp:[29,31]},{text:'sí',timestamp:[60,61]}],65);assert.deepEqual(r.bins.map(b=>b.words),[0,1,1]);assert.equal(r.bins[2].wpm,12);});
test('missing timestamps are exposed',()=>assert.equal(wordSegments([{text:'hola',timestamp:[null,null]}],60).untimed,1));
test('uniform activity does not collapse to zero',()=>{const r=acousticActivity(new Float32Array(16000).fill(.1),16000);assert.ok(r.speech>.99);});
test('silence produces no internal pauses',()=>{const r=acousticActivity(new Float32Array(16000),16000);assert.equal(r.speech,0);assert.equal(r.silence,1);assert.equal(r.pauses.length,0);});
test('internal silence and recording edges distinguished',()=>{const x=new Float32Array(16000*4);x.fill(.1,8000,16000);x.fill(.1,32000,48000);const r=acousticActivity(x,16000);assert.equal(r.pauses.length,1);assert.ok(Math.abs(r.pauses[0].duration-1)<.03);assert.ok(Math.abs(r.speech+r.silence-4)<1e-8);});
