import test from 'node:test';import assert from 'node:assert/strict';import {countWords,formatTime,wordSegments,acousticActivity,LiveWordTracker,finalMetrics,sharedChartScale,intervalAt} from '../analysis.mjs';
test('Spanish punctuation and accents',()=>assert.equal(countWords('¡Hoy, yo… yo quiero ir!'),5));
test('time rolls over correctly',()=>assert.equal(formatTime(59.8),'01:00'));
test('word boundaries and partial final interval',()=>{const r=wordSegments([{text:'hola',timestamp:[29,31]},{text:'sí',timestamp:[60,61]}],65,30);assert.deepEqual(r.bins.map(b=>b.words),[0,1,1]);assert.equal(r.bins[2].wpm,12);});
test('missing timestamps are exposed',()=>assert.equal(wordSegments([{text:'hola',timestamp:[null,null]}],60).untimed,1));
test('uniform activity does not collapse to zero',()=>{const r=acousticActivity(new Float32Array(16000).fill(.1),16000);assert.ok(r.speech>.99);});
test('silence produces no internal pauses',()=>{const r=acousticActivity(new Float32Array(16000),16000);assert.equal(r.speech,0);assert.equal(r.silence,1);assert.equal(r.pauses.length,0);});
test('internal silence and recording edges distinguished',()=>{const x=new Float32Array(16000*4);x.fill(.1,8000,16000);x.fill(.1,32000,48000);const r=acousticActivity(x,16000);assert.equal(r.pauses.length,1);assert.ok(Math.abs(r.pauses[0].duration-1)<.03);assert.ok(Math.abs(r.speech+r.silence-4)<1e-8);});

test('recent speed expires and uses partial initial window',()=>{const t=new LiveWordTracker();t.update('uno dos tres',5);assert.equal(t.recent(5,5),36);assert.equal(t.recent(21,21),0);assert.equal(t.recent(2,2),null);});
test('interim revisions replace rather than duplicate words',()=>{const t=new LiveWordTracker();t.update('uno dos',5);t.update('uno dos tres',6);t.update('uno cuatro',7);assert.equal(t.entries.length,2);assert.equal(t.entries[0].time,5);assert.equal(t.entries[1].time,7);t.update('uno cuatro',9);assert.equal(t.entries[1].time,7);});
test('10 and 15 second intervals keep actual last duration',()=>{const chunks=[{text:'hola',timestamp:[14,15]},{text:'sí',timestamp:[30,31]}];assert.deepEqual(wordSegments(chunks,31,15).bins.map(b=>b.words),[1,0,1]);assert.equal(wordSegments(chunks,31,15).bins[2].wpm,60);assert.equal(wordSegments(chunks,31,10).bins[3].wpm,60);});
test('missing timestamps never invent a temporal graph',()=>{assert.equal(finalMetrics({text:'hola',chunks:[]},30).bins,null);assert.equal(finalMetrics({text:'hola',chunks:[{text:'hola',timestamp:[null,null]}]},30).bins,null);});
test('valid timestamps produce final mean independent of intervals',()=>{const o={text:'hola sí',chunks:[{text:'hola',timestamp:[1,2]},{text:'sí',timestamp:[20,21]}]};assert.equal(finalMetrics(o,30,10).mean,4);assert.equal(finalMetrics(o,30,15).mean,4);});
test('shared comparison scale does not pad short sample with silence',()=>{const a={duration:20,mean:60,bins:[{start:0,end:20,wpm:60}]};const b={duration:60,mean:120,bins:[{start:0,end:15,wpm:180}]};assert.deepEqual(sharedChartScale([a,b]),{duration:60,max:216});assert.equal(intervalAt(25,a.bins),null);assert.equal(intervalAt(10,a.bins),a.bins[0]);});
test('invalid interval input is rejected',()=>assert.throws(()=>wordSegments([],30,0)));

test('therapy zones include boundaries without claiming normality', async () => {
  const {speedZone}=await import('../analysis.mjs');const goal={min:120,max:150};
  assert.equal(speedZone(119,goal),'slow');assert.equal(speedZone(120,goal),'target');assert.equal(speedZone(150,goal),'target');assert.equal(speedZone(151,goal),'fast');assert.equal(speedZone(null,goal),'unknown');
});
test('therapy percentages use full duration with unavailable time and contiguous runs',async()=>{
  const {therapySummary}=await import('../analysis.mjs');
  const s=therapySummary([{start:3,end:8,wpm:130},{start:8,end:10,wpm:140},{start:10,end:12,wpm:170},{start:14,end:16,wpm:130}],20,{min:120,max:150});
  assert.equal(s.longest,7);assert.equal(s.percent.target,45);assert.equal(s.percent.fast,10);assert.equal(s.percent.unknown,45);
  assert.equal(therapySummary(null,20,{min:120,max:150}).percent.unknown,100);
});

test('pause gate tolerates short gaps, stays neutral in long silence and resumes',async()=>{
  const {PauseGate}=await import('../analysis.mjs');const gate=new PauseGate();
  assert.equal(gate.update(.02,0).paused,false);assert.equal(gate.update(0,1).paused,false);
  assert.equal(gate.update(.02,1.4).paused,false);gate.update(0,2);
  assert.equal(gate.update(0,3).paused,true);assert.equal(gate.update(0,8).paused,true);
  assert.deepEqual(gate.update(.02,9),{paused:false,resumed:true});
});
