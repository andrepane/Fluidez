import {comparePitchCurves} from './pitch-comparison.mjs';
import {SPECTRAL_CONFIG,SpectralRaster} from './spectrogram.mjs';
import {LiveAnalysisClient} from './live-analysis-client.mjs';
import {contiguousRuns,curveSegments,VisualClock,movingWindow,LIVE_WINDOW_SECONDS,VISUAL_DELAY,revealedTip} from './live-curve.mjs';
import {visualPoints,referencePoints,AdaptiveScale,comparisonExtent} from './prosody.mjs';
import {MAX_SECONDS,validLimits,summarize,wav16,validateFinal,plotRange,timeAtX,nearestPoint} from './pitch-data.mjs';
const $=id=>document.getElementById(id);
const clock=s=>`${String(Math.floor(s/60)).padStart(2,'0')}:${String(Math.floor(s%60)).padStart(2,'0')}`;
const advice={'Frases':'Pronuncia la frase con una voz cómoda.','Lectura':'Lee con naturalidad y observa cómo cambia tu tono.','Habla espontánea':'Habla libremente y observa la melodía de tu voz.'};
let liveEngine,lastDiagnosticPaint=0;
let latestAgeMs=Infinity;
let spectral=null,raster=null;
let stream,context,capture,silent,autoStop,aborter,flushResolve;
let points=[],chunks=[],blob,audioURL,prepared,busy=false,recording=false,rate=48000,duration=0;
let limits={floor:75,ceiling:600},task='Habla espontánea',sourceKind='none',lastPlotTime=0,captureComplete=false;
let replaceTarget=null;
let attempts=[null,null],selected=0,chartSource='',exerciseText='',mode='free',guide={low:130,high:250,duration:4};
const adaptive=new AdaptiveScale();
const visualClock=new VisualClock();
let scheduled=false,lastAnimationKey=null;
function scheduleDraw(){if(scheduled)return;scheduled=true;window.requestAnimationFrame(()=>{scheduled=false;const key=`${visualClock.at(performance.now()).clock}:${points.length}`;if(!recording||key!==lastAnimationKey){draw();lastAnimationKey=key;}if(recording&&!document.hidden)scheduleDraw();});}
function saveAttempt(){
 attempts[selected]={spectral,points,duration,blob,prepared,limits:{...limits},task,sourceKind,chartSource,exerciseText,mode,guide:{...guide}};
 for(let i=0;i<2;i++)$('pitchAttempt'+i).disabled=busy||!attempts[i];
 $('pitchComparison').textContent=attempts.map((a,i)=>a?`Intento ${i+1}: ${a.duration.toFixed(1)} s · ${a.sourceKind==='final'?'Praat final':'provisional / pendiente'}`:'').filter(Boolean).join(' · ')+'. Mismo tiempo real desde el inicio, sin alinear ni estirar las curvas.';
}
function selectAttempt(i){
 if(busy||!attempts[i])return;
 selected=i;const a=attempts[i];({points,duration,prepared,limits,task,sourceKind,chartSource,exerciseText,mode,guide,spectral}=a);raster=spectral?new SpectralRaster(spectral):null;
 $('pitchTask').value=task;$('pitchText').value=exerciseText;$('pitchMode').value=mode;$('pitchFloor').value=String(limits.floor);$('pitchCeiling').value=String(limits.ceiling);$('pitchGuideLow').value=String(guide.low);$('pitchGuideHigh').value=String(guide.high);$('pitchGuideDuration').value=String(guide.duration);setAudio(a.blob);adaptive.reset();summary(chartSource);status('Escuchando intento '+(i+1)+'. '+(sourceKind==='final'?'Análisis final disponible.':'Estimación provisional / pendiente de análisis.'));controls();$('pitchAudio').play().catch(()=>status('Pulsa reproducir para escuchar.'));
}
function exercise(){
 $('pitchPrompt').textContent=exerciseText;
 $('pitchPrompt').hidden=!$('pitchTextVisible').checked||!exerciseText;
 $('pitchGuideLegend').hidden=mode==='free';
}
function nextSlot(){
 const empty=attempts.findIndex(a=>!a);
 if(empty>=0)return empty;
 if(replaceTarget!==null)return replaceTarget;
 throw Error('Ya hay dos intentos. Elige explícitamente cuál sustituir antes de grabar o importar.');
}
function ready(){
 if(busy)return;
 $('pitchAudio').pause();spectral=null;raster=null;points=[];duration=0;prepared=null;blob=null;sourceKind='none';chartSource='';
 view('setup');$('pitchResults').hidden=true;$('pitchTimer').textContent='00:00';$('pitchValue').textContent='—';$('pitchLiveState').textContent='Preparado';$('pitchBadge').textContent='Práctica libre';$('pitchInstruction').textContent='Empieza a hablar cuando quieras.';$('pitchWorkspaceLabel').textContent='Tu curva de entonación';$('pitchHover').textContent=`Últimos ${LIVE_WINDOW_SECONDS} segundos durante la práctica · estimación provisional`;processing(null);status('Preparado para grabar.');configurationChanged();controls();draw();
}
function paintDiagnostic(){if(!liveEngine?.diagnostic)return;$('pitchDiagnosticReport').textContent=JSON.stringify(liveEngine.report(),null,2);}
function status(text){$('pitchStatus').textContent=text;}
function view(value){$('pitchSurface').dataset.view=value;}
function controls(){
 for(const id of ['pitchRecord','pitchUpload','pitchFloor','pitchCeiling','pitchTask','pitchHome','pitchAgain','pitchMode','pitchText','pitchTextVisible','pitchGuideLow','pitchGuideHigh','pitchGuideDuration','pitchDiagnose'])$(id).disabled=busy;
 for(let i=0;i<2;i++){$('pitchAttempt'+i).disabled=busy||!attempts[i];$('pitchReplace'+i).disabled=busy;$('pitchReview'+i).disabled=busy||!attempts[i];}
 const full=attempts.every(Boolean)&&replaceTarget===null;$('pitchCapacity').hidden=!full;$('pitchRecord').disabled=busy||full;$('pitchUpload').disabled=busy||full;
 $('pitchStop').disabled=!recording;$('pitchRetry').disabled=busy||!prepared;
}
function processing(title){$('pitchProcessing').hidden=!title;if(title)$('pitchProcessingTitle').textContent=title;}
function chartBox(){
 const c=$('pitchChart'),rect=c.getBoundingClientRect(),ratio=window.devicePixelRatio||1;
 const w=Math.max(260,rect.width),h=Math.max(220,rect.height);
 if(c.width!==Math.round(w*ratio)||c.height!==Math.round(h*ratio)){c.width=Math.round(w*ratio);c.height=Math.round(h*ratio);}
 const ctx=c.getContext('2d');ctx.setTransform(ratio,0,0,ratio,0,0);return {c,ctx,w,h,left:60,right:20,top:24,bottom:44};
}
function draw(){
 const {ctx,w,h,left,right,top,bottom}=chartBox(),style=getComputedStyle($('pitchSurface'));
 const text=style.getPropertyValue('--muted').trim()||'#65736f',accent=style.getPropertyValue('--accent').trim()||'#237565',border=style.getPropertyValue('--border').trim()||'#dfe7e3';
 const readyView=$('pitchSurface').dataset.view==='setup';
 const visible=readyView?[]:recording?[{points,duration}]:attempts.some(Boolean)?attempts.filter((a,i)=>a&&$('pitchShow'+i).checked):[{points,duration}];
 const visual=visualClock.at(performance.now()),windowRange=movingWindow(visual.clock);
 const end=readyView?LIVE_WINDOW_SECONDS:recording?windowRange.end:comparisonExtent(attempts.some(Boolean)?attempts:[{duration}]),begin=recording?windowRange.begin:0,span=end-begin;
 const reference=referencePoints(mode,guide.low,guide.high,guide.duration);
 const range=recording?{low:limits.floor,high:limits.ceiling}:plotRange([...visible.flatMap(a=>a.points),...reference],Math.min(limits.floor,...attempts.filter(Boolean).map(a=>a.limits.floor)),Math.max(limits.ceiling,...attempts.filter(Boolean).map(a=>a.limits.ceiling)));
 const x=t=>left+(t-begin)/span*(w-left-right),y=f=>h-bottom-Math.log2(f/range.low)/Math.log2(range.high/range.low)*(h-top-bottom);
 ctx.clearRect(0,0,w,h);ctx.font='12px system-ui';ctx.fillStyle=text;
 for(let i=0;i<=4;i++){
  const f=range.low*(range.high/range.low)**(i/4),py=y(f);
  ctx.strokeStyle=border;ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(left,py);ctx.lineTo(w-right,py);ctx.stroke();ctx.fillText(`${Math.round(f)} Hz`,4,py+4);
  const t=begin+span*i/4;if(!$('pitchHybrid').checked)ctx.fillText(`${t.toFixed(span<10?1:0)} s`,Math.min(w-right-30,Math.max(left-8,x(t)-10)),h-9);
 }
 ctx.save();ctx.beginPath();ctx.rect(left,top,w-left-right,h-top-bottom+6);ctx.clip();
 if(reference.length){ctx.strokeStyle='#8a6ba6';ctx.lineWidth=1.5;ctx.setLineDash([7,6]);ctx.beginPath();reference.forEach((p,i)=>{if(i)ctx.lineTo(x(p.time),y(p.hz));else ctx.moveTo(x(p.time),y(p.hz));});ctx.stroke();ctx.setLineDash([]);}
 let liveDisplayed=[];
 for(const a of visible){
 ctx.strokeStyle=!recording&&a===attempts[1]?'#8a6ba6':accent;ctx.globalAlpha=recording?.65:1;ctx.lineWidth=2.5;ctx.lineJoin='round';ctx.lineCap='round';ctx.beginPath();let previous=null;
 const displayed=visualPoints(a.points.filter(p=>p.time>=begin-.12&&p.time<=end),recording&&$('pitchSmooth').checked);if(recording)liveDisplayed=displayed;
 if(recording&&$('pitchRenderSmooth').checked){
 ctx.save();ctx.beginPath();ctx.rect(left,top,Math.max(0,x(visual.reveal)-left),h-top-bottom);ctx.clip();ctx.beginPath();
 for(const run of contiguousRuns(displayed)){ctx.moveTo(x(run[0].time),y(run[0].hz));for(const segment of curveSegments(run))ctx.bezierCurveTo(x(segment.c1.time),y(segment.c1.hz),x(segment.c2.time),y(segment.c2.hz),x(segment.to.time),y(segment.to.hz));}
 ctx.stroke();ctx.restore();continue;
 }
 for(const p of displayed){
  if(p.hz===null){previous=null;continue;}
  if(previous&&p.time-previous.time<.12)ctx.lineTo(x(p.time),y(p.hz));else ctx.moveTo(x(p.time),y(p.hz));
  previous=p;
 }
 ctx.stroke();
 }
 ctx.globalAlpha=1;
 if(recording){
 const horizon=$('pitchRenderSmooth').checked?visual.reveal:duration;
 const displayed=liveDisplayed.filter(p=>p.time>=Math.max(begin,horizon-.7)),tip=$('pitchRenderSmooth').checked?revealedTip(liveDisplayed,horizon):liveDisplayed.at(-1),latest=points.at(-1);
 if(latest?.hz!==null&&latest&&tip?.hz!==null&&tip&&latestAgeMs<=250&&duration-latest.time<.25&&horizon-tip.time<.25){
  ctx.save();ctx.beginPath();ctx.rect(left,top,Math.max(0,x(horizon)-left),h-top-bottom);ctx.clip();ctx.strokeStyle=accent;ctx.lineWidth=3.5;ctx.beginPath();for(const run of contiguousRuns(displayed)){ctx.moveTo(x(run[0].time),y(run[0].hz));for(const segment of curveSegments(run))ctx.bezierCurveTo(x(segment.c1.time),y(segment.c1.hz),x(segment.c2.time),y(segment.c2.hz),x(segment.to.time),y(segment.to.hz));}ctx.stroke();ctx.restore();
  ctx.beginPath();ctx.arc(x(tip.time),y(tip.hz),4.5,0,Math.PI*2);ctx.fillStyle=accent;ctx.fill();
 }
}
 if(!recording&&!readyView&&$('pitchAudio').currentTime>0){const px=x($('pitchAudio').currentTime);ctx.strokeStyle=text;ctx.lineWidth=1.5;ctx.setLineDash([4,4]);ctx.beginPath();ctx.moveTo(px,top);ctx.lineTo(px,h-bottom);ctx.stroke();ctx.setLineDash([]);}
 ctx.restore();
 drawSpectrum({begin,end,reveal:recording&&$('pitchRenderSmooth').checked?visual.reveal:end,readyView});
 if(recording&&liveEngine?.diagnostic)liveEngine.noteRender(points.filter(p=>p.hz!==null&&p.time>=begin&&p.time<=Math.min(end,visual.reveal)).length);
 if(readyView||!visible.some(a=>a.points.some(p=>p.hz!==null))){ctx.fillStyle=text;ctx.textAlign='center';ctx.fillText(recording?'Esperando un tono estimable…':readyView?'Pulsa Empezar práctica y habla':'Sin F0 estimable en los intentos visibles',left+(w-left-right)/2,top+(h-top-bottom)/2);ctx.textAlign='left';}
}
function drawSpectrum({begin,end,reveal,readyView}){
 const full=$('pitchHybrid').checked;$('pitchSpectrumPanel').hidden=!full;$('pitchSurface').dataset.visual=full?'complete':'simple';if(!full)return;
 const c=$('pitchSpectrum'),rect=c.getBoundingClientRect(),ratio=window.devicePixelRatio||1,w=Math.max(260,rect.width),h=Math.max(110,rect.height);
 if(c.width!==Math.round(w*ratio)||c.height!==Math.round(h*ratio)){c.width=Math.round(w*ratio);c.height=Math.round(h*ratio);}
 const ctx=c.getContext('2d');ctx.setTransform(ratio,0,0,ratio,0,0);ctx.clearRect(0,0,w,h);const left=60,right=20,top=8,bottom=30;
 ctx.fillStyle='#f2f7f5';ctx.fillRect(left,top,w-left-right,h-top-bottom);
 if(!readyView&&raster)raster.draw(ctx,{left,top,width:w-left-right,height:h-top-bottom,begin,end,reveal});
 ctx.font='11px system-ui';ctx.fillStyle=getComputedStyle($('pitchSurface')).getPropertyValue('--muted').trim()||'#65736f';
 const max=spectral?Math.min(spectral.config.maxHz,spectral.rate/2):8000;
 for(let i=0;i<=2;i++)ctx.fillText(`${(max*(1-i/2)/1000).toFixed(0)} kHz`,5,top+(h-top-bottom)*i/2+4);
 for(let i=0;i<=4;i++){const t=begin+(end-begin)*i/4;ctx.fillText(`${t.toFixed(end-begin<10?1:0)} s`,Math.min(w-right-30,Math.max(left-8,left+(w-left-right)*i/4-10)),h-7);}
 if(!recording&&!readyView&&raster&&$('pitchAudio').currentTime>0){const x=left+($('pitchAudio').currentTime-begin)/(end-begin)*(w-left-right);ctx.strokeStyle=ctx.fillStyle;ctx.setLineDash([4,4]);ctx.beginPath();ctx.moveTo(x,top);ctx.lineTo(x,h-bottom);ctx.stroke();ctx.setLineDash([]);}
 $('pitchSpectrumLabel').textContent=readyView?'Actividad acústica · energía en frecuencias':spectral?`Actividad acústica · ${recording?'en directo':'intento '+(selected+1)} · no es entonación`:'Espectrograma disponible para las prácticas grabadas en esta sesión';
}
function summary(source){
 const stats=summarize(points),voiced=points.filter(p=>p.hz!==null).length,available=voiced>=5;
 const fmt=v=>available&&v!==null?`${Math.round(v)} Hz`:'No disponible';
 const entries=[['Tono mediano',fmt(stats.median),'Valor central de los tonos detectados.'],['Rango central',available?`${Math.round(stats.p10)}–${Math.round(stats.p90)} Hz`:'No disponible','Variación del 80 % central; no es el rango vocal máximo.'],['Duración de la muestra',`${duration.toFixed(1)} s`,'Incluye toda la grabación, también los huecos.']];
 $('pitchSummary').replaceChildren(...entries.map(([label,value,note])=>{const d=document.createElement('div'),strong=document.createElement('strong'),small=document.createElement('small');d.textContent=label;strong.textContent=value;small.textContent=note;d.append(strong,small);return d;}));
 $('pitchCoverage').textContent=points.length?`F0 válida en ${voiced}/${points.length} ventanas (${Math.round(stats.detected*100)} %). Denominador: todas las ventanas devueltas por el motor; numerador: frecuencia positiva finita dentro de los límites de búsqueda. Los huecos no equivalen a silencio ni a una alteración de la voz.`:'Todavía no hay una curva calculada para esta muestra.';
 $('pitchContext').textContent=`${task} · ${duration.toFixed(1)} segundos · ${sourceKind==='final'?'análisis final':'estimación provisional'}`;
 $('pitchResultState').textContent=sourceKind==='final'?'Final · Praat':'Provisional';$('pitchBadge').textContent=sourceKind==='final'?'Resultado final':'Resumen provisional';
 chartSource=source;saveAttempt();exercise();$('pitchChartSource').textContent=source;$('pitchResults').hidden=false;
 $('pitchWorkspaceLabel').textContent='El patrón de tu muestra';$('pitchInstruction').textContent='Cómo se movió tu tono';
 $('pitchHover').textContent='Pulsa la curva para escuchar ese momento. También puedes usar las flechas.';
 view('results');draw();
}
function cleanupCapture(){
 liveEngine?.close();
 clearTimeout(autoStop);if(capture){capture.port.onmessage=null;capture.disconnect();}silent?.disconnect();capture=null;silent=null;
 stream?.getTracks().forEach(t=>t.stop());stream=null;
 if(context){context.close().catch(()=>{});context=null;}
}
function setAudio(b){
 blob=b;$('pitchAudio').pause();if(audioURL)URL.revokeObjectURL(audioURL);audioURL=URL.createObjectURL(b);
 $('pitchAudio').src=audioURL;$('pitchDownload').href=audioURL;
 $('pitchDownload').download=`fluidez-tono.${b.type.includes('wav')?'wav':b.type.includes('ogg')?'ogg':b.type.includes('mp4')?'m4a':'webm'}`;
 $('pitchDownload').textContent=b.type.includes('wav')?'Descargar grabación WAV':'Descargar audio original';
}
async function prepare(b){
 const C=window.AudioContext||window.webkitAudioContext,decoder=new C();let decoded;
 try{decoded=await decoder.decodeAudioData(await b.arrayBuffer());}finally{await decoder.close();}
 if(decoded.duration<.1||decoded.duration>MAX_SECONDS)throw Error('Esta prueba admite muestras de 0,1 segundos a 2 minutos.');
 const offline=new OfflineAudioContext(1,Math.ceil(decoded.duration*16000),16000),source=offline.createBufferSource();source.buffer=decoded;source.connect(offline.destination);source.start();
 const mono=await offline.startRendering();return {wav:wav16(mono.getChannelData(0)),duration:decoded.duration};
}
async function finalAnalysis(){
 busy=true;document.body.dataset.session='processing';controls();processing('Calculando el tono con Praat…');
 status('El análisis continúa. La grabación y el resumen provisional siguen disponibles.');
 aborter=new AbortController();const timeout=setTimeout(()=>aborter.abort(),45000);
 try{
  const res=await fetch('/api/voice-analysis',{method:'POST',headers:{'Content-Type':'audio/wav','X-Pitch-Floor':String(limits.floor),'X-Pitch-Ceiling':String(limits.ceiling)},body:prepared,signal:aborter.signal});
  if(!res.ok)throw Error(res.status===503?'El motor Praat no está disponible en este despliegue.':res.status===429?'El servidor está ocupado. Espera un poco antes de reintentar.':`El análisis final no se ha completado (${res.status}).`);
  const result=validateFinal(await res.json());
  if(sourceKind==='live'&&liveEngine?.diagnostic){const comparison=comparePitchCurves(points,result.points);$('pitchDiagnosticReport').textContent=JSON.stringify({...liveEngine.report(),sameAudioComparison:comparison},null,2);}
  points=result.points;duration=result.duration;sourceKind='final';
  $('pitchSignalNotice').textContent=result.signal?.clippedFraction>.01?'Hay muestras cercanas al límite digital. Repite con menor ganancia o más distancia al micrófono.':'La periodicidad del detector no garantiza una F0 correcta. El ruido y los armónicos pueden producir errores.';
  summary(`Análisis final · Praat ${result.praatVersion} / Parselmouth ${result.version} · ${result.method} · pasos de 10 ms`);
  status(points.some(p=>p.hz!==null)?'Análisis final terminado. Escucha la muestra siguiendo la curva.':'Análisis terminado sin tono estimable. Revisa la señal y los límites de búsqueda.');
 }catch(e){status(`${e.name==='AbortError'?'El servidor ha tardado demasiado.':e.message} Conservamos el audio y los resultados disponibles; puedes reintentar.`);}
 finally{clearTimeout(timeout);aborter=null;busy=false;document.body.dataset.session='done';processing(null);controls();}
}
function readConfiguration(){
 const candidate={floor:Number($('pitchFloor').value),ceiling:Number($('pitchCeiling').value)};
 if(!validLimits(candidate.floor,candidate.ceiling))throw Error('Revisa los límites: mínimo 50–300 Hz, máximo 150–1200 Hz y máximo al menos el doble del mínimo.');
 const low=Number($('pitchGuideLow').value),high=Number($('pitchGuideHigh').value),seconds=Number($('pitchGuideDuration').value);
 if(low<50||high>1200||seconds<1||seconds>120)throw Error('Revisa los límites de la guía.');
 referencePoints($('pitchMode').value,low,high,seconds);
 return {limits:candidate,slot:nextSlot(),task:$('pitchTask').value||'Habla espontánea'};
}
function analyzed(data){
 for(const p of data.points)if(p.time>lastPlotTime){points.push({time:p.time,hz:p.hz});lastPlotTime=p.time;}
 spectral.columns.push(...data.columns);latestAgeMs=data.ageMs;
 const value=data.points.at(-1);
 if(value&&recording){const stale=latestAgeMs>250||duration-data.endFrame/rate>.25;
  $('pitchValue').textContent=stale||value.hz===null?'—':`${Math.round(value.hz)} Hz`;
  $('pitchLiveState').textContent=stale?'Esperando datos recientes':value.hz===null?'Escuchando · sin tono fiable':'Siguiendo tu entonación';
 }
 if(liveEngine.diagnostic&&performance.now()-lastDiagnosticPaint>=500){paintDiagnostic();lastDiagnosticPaint=performance.now();}
 if(recording)scheduleDraw();
}
function directError(error){$('pitchValue').textContent='—';$('pitchLiveState').textContent='Directo no disponible';latestAgeMs=Infinity;status(error.message+' Puedes terminar y analizar el audio.');}
function captured(message){
 const data=message.data,samples=new Float32Array(data.audio);
 if(samples.length){chunks.push(samples);duration=data.endFrame/rate;visualClock.accept(duration,performance.now());liveEngine.push(samples,data.endFrame,Math.max(0,(context.currentTime-data.audioTime)*1000));if(recording){$('pitchTimer').textContent=clock(duration);scheduleDraw();}}
 if(data.done){captureComplete=true;if(flushResolve){flushResolve();flushResolve=null;}else if(recording)void stop();}
}
async function start(){
 if(busy)return;busy=true;controls();document.body.dataset.session='starting';
 try{
  const configuration=readConfiguration();
  if(!navigator.mediaDevices?.getUserMedia||!window.AudioWorkletNode)throw Error('La grabación WAV requiere AudioWorklet. Usa un navegador actualizado o sube un audio.');
  stream=await navigator.mediaDevices.getUserMedia({audio:{channelCount:1,echoCancellation:false,noiseSuppression:false,autoGainControl:false}});
  const C=window.AudioContext||window.webkitAudioContext;context=new C();await context.resume();
  if(!context.audioWorklet?.addModule)throw Error('Este navegador no permite capturar WAV. Usa uno actualizado o sube un audio.');
  await context.audioWorklet.addModule('./pitch-capture.worklet.js');rate=context.sampleRate;
  capture=new AudioWorkletNode(context,'fluidez-pitch-capture',{processorOptions:{frameSize:Math.round(rate*.02),maxFrames:Math.floor(rate*(MAX_SECONDS-1))},numberOfInputs:1,numberOfOutputs:1,outputChannelCount:[1]});
  silent=context.createGain();silent.gain.value=0;capture.connect(silent);silent.connect(context.destination);
  limits=configuration.limits;task=configuration.task;selected=configuration.slot;replaceTarget=null;exerciseText=$('pitchText').value.trim();mode=$('pitchMode').value;guide={low:Number($('pitchGuideLow').value),high:Number($('pitchGuideHigh').value),duration:Number($('pitchGuideDuration').value)};adaptive.reset();exercise();liveEngine=new LiveAnalysisClient({onresult:analyzed,onerror:directError});await liveEngine.init(rate,limits,{diagnostic:$('pitchDiagnose').checked});latestAgeMs=Infinity;lastDiagnosticPaint=0;lastPlotTime=-1;paintDiagnostic();
  spectral={rate,config:SPECTRAL_CONFIG,hop:Math.round(rate*SPECTRAL_CONFIG.hopSeconds),columns:[]};raster=new SpectralRaster(spectral);points=[];chunks=[];duration=0;visualClock.reset();prepared=null;sourceKind='live';captureComplete=false;capture.port.onmessage=captured;
  $('pitchAudio').pause();$('pitchAudio').removeAttribute('src');$('pitchResults').hidden=true;$('pitchTimer').textContent='00:00';$('pitchValue').textContent='—';$('pitchLiveState').textContent='Escuchando';$('pitchToneMarker').hidden=true;
  $('pitchInstruction').textContent=advice[task];$('pitchWorkspaceLabel').textContent=`Directo · últimos ${LIVE_WINDOW_SECONDS} segundos`;$('pitchBadge').textContent='Estimación en directo';
  $('pitchChartSource').textContent='Provisional · Pitchy · procesamiento local separado';$('pitchHover').textContent='Observa cómo sube y baja tu tono. Los huecos no significan que lo estés haciendo mal.';
  recording=true;document.body.dataset.session='recording';view('recording');$('pitchWorkspace').scrollIntoView?.({block:'start',behavior:'smooth'});context.createMediaStreamSource(stream).connect(capture);
  status('Grabando WAV en tu dispositivo. El marcador es una estimación; no indica normalidad.');
  autoStop=setTimeout(stop,(MAX_SECONDS-1)*1000);controls();draw();
 }catch(e){cleanupCapture();recording=false;busy=false;document.body.dataset.session='done';controls();status(e.message||'No se pudo acceder al micrófono.');}
}
async function stop(){
 if(!recording)return;recording=false;controls();clearTimeout(autoStop);document.body.dataset.session='stopping';status('Terminando la grabación…');$('pitchValue').textContent='—';$('pitchLiveState').textContent='Terminando';$('pitchToneMarker').hidden=true;
 let incomplete=false;
 try{
  if(!captureComplete)await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{flushResolve=null;reject(Error('No se confirmó el final de la captura.'));},2000);flushResolve=()=>{clearTimeout(timer);resolve();};capture.port.postMessage('flush');});
 }catch{incomplete=true;}
 try{await liveEngine.flush();}catch(e){status(e.message);}paintDiagnostic();cleanupCapture();$('pitchValue').textContent='—';$('pitchLiveState').textContent='Grabación terminada';$('pitchToneMarker').hidden=true;
 const length=chunks.reduce((n,c)=>n+c.length,0);if(!length){busy=false;document.body.dataset.session='done';view('setup');controls();status('No se capturó audio. Vuelve a intentarlo.');return;}
 const raw=new Float32Array(length);let offset=0;for(const c of chunks){raw.set(c,offset);offset+=c.length;}chunks=[];
 duration=length/rate;setAudio(new Blob([wav16(raw,rate)],{type:'audio/wav'}));
 summary('Resumen provisional · McLeod/NSDF en directo · pendiente de Praat');
 if(incomplete){busy=false;document.body.dataset.session='done';controls();status('No se confirmó el final de la captura. Conservamos un WAV que podría estar incompleto; no se envía automáticamente a Praat.');return;}
 processing('Preparando tu muestra…');
 try{const ready=await prepare(blob);prepared=ready.wav;await finalAnalysis();}
 catch(e){busy=false;document.body.dataset.session='done';processing(null);controls();status(`${e.message} Conservamos la grabación.`);}
}
async function upload(event){
 const file=event.target.files[0];event.target.value='';if(!file||busy)return;
 if(file.size>20*1024*1024){status('El archivo supera el límite de 20 MB.');return;}
 busy=true;controls();document.body.dataset.session='processing';processing('Preparando el audio…');
 try{const configuration=readConfiguration(),ready=await prepare(file);limits=configuration.limits;task=configuration.task;selected=configuration.slot;replaceTarget=null;exerciseText=$('pitchText').value.trim();mode=$('pitchMode').value;guide={low:Number($('pitchGuideLow').value),high:Number($('pitchGuideHigh').value),duration:Number($('pitchGuideDuration').value)};adaptive.reset();exercise();prepared=ready.wav;duration=ready.duration;spectral=null;raster=null;points=[];sourceKind='import';setAudio(file);summary('Audio importado · pendiente de Praat · sin estimación en directo');await finalAnalysis();}
 catch(e){status(e.message);busy=false;document.body.dataset.session='done';processing(null);controls();}
}
function hover(event){
 if(busy||$('pitchSurface').dataset.view==='setup'||!duration)return;const rect=$('pitchChart').getBoundingClientRect(),time=timeAtX(event.clientX-rect.left,rect.width,comparisonExtent(attempts)),p=nearestPoint(points,time);
 $('pitchHover').textContent=`${time.toFixed(2)} s · ${p&&Math.abs(p.time-time)<.12&&p.hz!==null?`${Math.round(p.hz)} Hz`:'sin estimación en ese momento'}`;
 return time;
}
$('pitchDiagnose').addEventListener('change',()=>{$('pitchDiagnostic').hidden=!$('pitchDiagnose').checked;});
$('pitchRecord').addEventListener('click',start);$('pitchStop').addEventListener('click',stop);$('pitchUpload').addEventListener('change',upload);
$('pitchRetry').addEventListener('click',()=>{if(!busy&&prepared)return finalAnalysis();});
$('pitchAgain').addEventListener('click',()=>{replaceTarget=null;ready();});
function configurationChanged(){
 if(busy)return;
 if($('pitchSurface').dataset.view==='results'){exercise();return;}
 task=$('pitchTask').value;$('pitchTaskAdvice').textContent=advice[task];exerciseText=$('pitchText').value.trim();mode=$('pitchMode').value;
 guide={low:Number($('pitchGuideLow').value),high:Number($('pitchGuideHigh').value),duration:Number($('pitchGuideDuration').value)};
 try{referencePoints(mode,guide.low,guide.high,guide.duration);exercise();draw();}catch(e){status(e.message);}
}
for(const id of ['pitchTask','pitchText','pitchTextVisible','pitchMode','pitchGuideLow','pitchGuideHigh','pitchGuideDuration','pitchDiagnose'])$(id).addEventListener('change',configurationChanged);
for(let i=0;i<2;i++)$('pitchReview'+i).addEventListener('click',()=>selectAttempt(i));
for(let i=0;i<2;i++)$('pitchReplace'+i).addEventListener('click',()=>{if(!busy){replaceTarget=i;ready();status('Preparado: la próxima muestra sustituirá el intento '+(i+1)+'.');}});
 for(let i=0;i<2;i++){$('pitchAttempt'+i).addEventListener('click',()=>selectAttempt(i));$('pitchShow'+i).addEventListener('change',draw);}
$('pitchHome').addEventListener('click',()=>{if(!busy){$('pitchAudio').pause();$('pitchSurface').hidden=true;$('modeHome').hidden=false;}});
$('pitchChart').addEventListener('pointermove',hover);
$('pitchChart').addEventListener('click',event=>{const time=hover(event);if(time!==undefined&&blob){$('pitchAudio').currentTime=Math.min(duration,time);$('pitchAudio').play().catch(()=>status('Pulsa reproducir para escuchar la muestra.'));draw();}});
$('pitchChart').addEventListener('keydown',event=>{if(recording||!blob||!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();$('pitchAudio').currentTime=Math.max(0,Math.min(duration,event.key==='Home'?0:event.key==='End'?duration:$('pitchAudio').currentTime+(event.key==='ArrowRight'?.5:-.5)));draw();});
$('pitchAudio').addEventListener('timeupdate',draw);$('pitchAudio').addEventListener('loadedmetadata',draw);window.addEventListener('resize',draw);document.addEventListener('visibilitychange',()=>{if(recording&&!document.hidden)scheduleDraw();});
window.addEventListener('pagehide',()=>{aborter?.abort();cleanupCapture();if(audioURL)URL.revokeObjectURL(audioURL);});
ready();

$('pitchHybrid').addEventListener('change',draw);

$('themeSwitch').addEventListener('click',draw);
