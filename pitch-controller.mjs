import {PitchDetector} from './vendor/pitchy-4.1.0.mjs';
import {MAX_SECONDS,validLimits,summarize,wav16,validateFinal,centerFrame,LiveToneTracker,CANDIDATE_THRESHOLD,plotRange,timeAtX,nearestPoint} from './pitch-data.mjs';
const $=id=>document.getElementById(id);
const clock=s=>`${String(Math.floor(s/60)).padStart(2,'0')}:${String(Math.floor(s%60)).padStart(2,'0')}`;
const advice={
 'Vocal sostenida':'Mantén una vocal cómoda unos segundos, sin forzar la voz.',
 'Subir y bajar el tono':'Desliza suavemente la voz hacia arriba y hacia abajo, sin forzar.',
 'Lectura / frases':'Lee con naturalidad y observa la melodía de las frases.',
 'Conversación':'Habla con naturalidad y observa cómo se mueve tu tono.'
};
let stream,context,capture,silent,autoStop,aborter,flushResolve;
let points=[],chunks=[],blob,audioURL,prepared,busy=false,recording=false,rate=48000,duration=0;
let limits={floor:75,ceiling:600},task='Vocal sostenida',detector,tracker,rolling,centered,fill=0,sourceKind='none',lastPlotTime=0,captureComplete=false;
function status(text){$('pitchStatus').textContent=text;}
function view(value){$('pitchSurface').dataset.view=value;}
function controls(){
 for(const id of ['pitchRecord','pitchUpload','pitchFloor','pitchCeiling','pitchTask','pitchHome','pitchAgain'])$(id).disabled=busy;
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
 const {ctx,w,h,left,right,top,bottom}=chartBox(),style=getComputedStyle(document.documentElement);
 const text=style.getPropertyValue('--muted').trim()||'#65736f',accent=style.getPropertyValue('--accent').trim()||'#237565',border=style.getPropertyValue('--border').trim()||'#dfe7e3';
 const end=recording?Math.max(8,duration):Math.max(.1,duration),begin=recording?Math.max(0,end-8):0,span=end-begin;
 const range=recording?{low:limits.floor,high:limits.ceiling}:plotRange(points,limits.floor,limits.ceiling);
 const x=t=>left+(t-begin)/span*(w-left-right),y=f=>h-bottom-Math.log2(f/range.low)/Math.log2(range.high/range.low)*(h-top-bottom);
 ctx.clearRect(0,0,w,h);ctx.font='12px system-ui';ctx.fillStyle=text;
 for(let i=0;i<=4;i++){
  const f=range.low*(range.high/range.low)**(i/4),py=y(f);
  ctx.strokeStyle=border;ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(left,py);ctx.lineTo(w-right,py);ctx.stroke();ctx.fillText(`${Math.round(f)} Hz`,4,py+4);
  const t=begin+span*i/4;ctx.fillText(`${t.toFixed(span<10?1:0)} s`,Math.min(w-right-30,Math.max(left-8,x(t)-10)),h-9);
 }
 ctx.save();ctx.beginPath();ctx.rect(left,top,w-left-right,h-top-bottom+6);ctx.clip();
 ctx.strokeStyle=accent;ctx.lineWidth=2.5;ctx.lineJoin='round';ctx.beginPath();let previous=null;
 for(const p of points){
  if(p.time<begin||p.time>end){previous=null;continue;}
  if(p.hz===null){previous=null;continue;}
  if(previous&&p.time-previous.time<.12)ctx.lineTo(x(p.time),y(p.hz));else ctx.moveTo(x(p.time),y(p.hz));
  previous=p;
 }
 ctx.stroke();
 // Detection strip: a mark is a detected window, not a silence diagnosis.
 ctx.strokeStyle=accent;ctx.lineWidth=4;ctx.beginPath();
 for(const p of points){if(p.hz!==null&&p.time>=begin&&p.time<=end){ctx.moveTo(x(p.time),h-bottom+4);ctx.lineTo(x(Math.min(end,p.time+(sourceKind==='final'?.01:.06))),h-bottom+4);}}
 ctx.stroke();
 if(recording&&points.at(-1)?.hz!==null&&points.at(-1)){const p=points.at(-1);ctx.beginPath();ctx.arc(x(p.time),y(p.hz),5,0,Math.PI*2);ctx.fillStyle=accent;ctx.fill();}
 if(!recording&&$('pitchAudio').currentTime>0){const px=x($('pitchAudio').currentTime);ctx.strokeStyle=text;ctx.lineWidth=1.5;ctx.setLineDash([4,4]);ctx.beginPath();ctx.moveTo(px,top);ctx.lineTo(px,h-bottom);ctx.stroke();ctx.setLineDash([]);}
 ctx.restore();
 if(!points.some(p=>p.hz!==null)){ctx.fillStyle=text;ctx.textAlign='center';ctx.fillText(recording?'Esperando un tono estimable…':'Aquí aparecerá la curva de tu voz',left+(w-left-right)/2,top+(h-top-bottom)/2);ctx.textAlign='left';}
}
function summary(source){
 const stats=summarize(points),voiced=points.filter(p=>p.hz!==null).length,available=voiced>=5;
 const fmt=v=>available&&v!==null?`${Math.round(v)} Hz`:'No disponible';
 const entries=[['Tono mediano',fmt(stats.median),'Valor central de los tonos detectados.'],['Rango central',available?`${Math.round(stats.p10)}–${Math.round(stats.p90)} Hz`:'No disponible','Variación del 80 % central; no es el rango vocal máximo.'],['Duración de la muestra',`${duration.toFixed(1)} s`,'Incluye toda la grabación, también los huecos.']];
 $('pitchSummary').replaceChildren(...entries.map(([label,value,note])=>{const d=document.createElement('div'),strong=document.createElement('strong'),small=document.createElement('small');d.textContent=label;strong.textContent=value;small.textContent=note;d.append(strong,small);return d;}));
 $('pitchCoverage').textContent=points.length?`Tono detectado en ${Math.round(stats.detected*100)} % de las ventanas analizadas. Los huecos no equivalen a silencio ni a una alteración de la voz.`:'Todavía no hay una curva calculada para esta muestra.';
 $('pitchContext').textContent=`${task} · ${duration.toFixed(1)} segundos · ${sourceKind==='final'?'análisis final':'estimación provisional'}`;
 $('pitchResultState').textContent=sourceKind==='final'?'Final · Praat':'Provisional';$('pitchBadge').textContent=sourceKind==='final'?'Resultado final':'Resumen provisional';
 $('pitchChartSource').textContent=source;$('pitchResults').hidden=false;
 $('pitchWorkspaceLabel').textContent='El patrón de tu muestra';$('pitchInstruction').textContent='Cómo se movió tu tono';
 $('pitchHover').textContent='Pulsa la curva para escuchar ese momento. También puedes usar las flechas.';
 view('results');draw();
}
function cleanupCapture(){
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
  const result=validateFinal(await res.json());points=result.points;duration=result.duration;sourceKind='final';
  $('pitchSignalNotice').textContent=result.signal?.clippedFraction>.01?'Hay muestras cercanas al límite digital. Repite con menor ganancia o más distancia al micrófono.':'La periodicidad del detector no garantiza una F0 correcta. El ruido y los armónicos pueden producir errores.';
  summary(`Análisis final · Praat ${result.praatVersion} / Parselmouth ${result.version} · ${result.method} · pasos de 10 ms`);
  status(points.some(p=>p.hz!==null)?'Análisis final terminado. Escucha la muestra siguiendo la curva.':'Análisis terminado sin tono estimable. Revisa la señal y los límites de búsqueda.');
 }catch(e){status(`${e.name==='AbortError'?'El servidor ha tardado demasiado.':e.message} Conservamos el audio y los resultados disponibles; puedes reintentar.`);}
 finally{clearTimeout(timeout);aborter=null;busy=false;document.body.dataset.session='done';processing(null);controls();}
}
function readConfiguration(){
 const candidate={floor:Number($('pitchFloor').value),ceiling:Number($('pitchCeiling').value)};
 if(!validLimits(candidate.floor,candidate.ceiling))throw Error('Revisa los límites: mínimo 50–300 Hz, máximo 150–1200 Hz y máximo al menos el doble del mínimo.');
 return {limits:candidate,task:$('pitchTask').value||'Vocal sostenida'};
}
function captured(message){
 const data=message.data,samples=new Float32Array(data.audio);
 if(samples.length){
  chunks.push(samples);duration=data.endFrame/rate;
  if(samples.length>=rolling.length){rolling.set(samples.subarray(samples.length-rolling.length));fill=rolling.length;}
  else{rolling.copyWithin(0,samples.length);rolling.set(samples,rolling.length-samples.length);fill=Math.min(rolling.length,fill+samples.length);}
  if(fill===rolling.length){
   const frame=centerFrame(rolling,centered),[hz,clarity]=detector.findPitch(frame.samples,rate);
   // Center-of-window timestamp, on the same clock as the saved WAV.
   const time=duration-rolling.length/(2*rate),value=tracker.update(hz,clarity,frame.rms,frame.clipped,time,limits.floor,limits.ceiling);
   if(time>lastPlotTime){points.push({time,hz:value.hz});lastPlotTime=time;}
   if(recording){
    const stale=context.currentTime-data.audioTime>.25;
    $('pitchValue').textContent=stale||value.hz===null?'—':`${Math.round(value.hz)} Hz`;
    $('pitchLiveState').textContent=stale?'Esperando datos recientes':value.state;
    $('pitchToneMarker').hidden=stale||value.hz===null;
    if(value.hz!==null)$('pitchToneMarker').style.top=`${100*(1-Math.log2(value.hz/limits.floor)/Math.log2(limits.ceiling/limits.floor))}%`;
   }
  }
  if(recording){$('pitchTimer').textContent=clock(duration);draw();}
 }
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
  capture=new AudioWorkletNode(context,'fluidez-pitch-capture',{processorOptions:{frameSize:Math.round(rate*.06),maxFrames:Math.floor(rate*(MAX_SECONDS-1))},numberOfInputs:1,numberOfOutputs:1,outputChannelCount:[1]});
  silent=context.createGain();silent.gain.value=0;capture.connect(silent);silent.connect(context.destination);
  limits=configuration.limits;task=configuration.task;detector=PitchDetector.forFloat32Array(4096);detector.clarityThreshold=CANDIDATE_THRESHOLD;
  tracker=new LiveToneTracker();rolling=new Float32Array(4096);centered=new Float32Array(4096);fill=0;lastPlotTime=-1;
  points=[];chunks=[];duration=0;prepared=null;sourceKind='live';captureComplete=false;capture.port.onmessage=captured;
  $('pitchAudio').pause();$('pitchAudio').removeAttribute('src');$('pitchResults').hidden=true;$('pitchTimer').textContent='00:00';$('pitchValue').textContent='—';$('pitchLiveState').textContent='Escuchando';$('pitchToneMarker').hidden=true;
  $('pitchInstruction').textContent=advice[task];$('pitchWorkspaceLabel').textContent='Directo · últimos 8 segundos';$('pitchBadge').textContent='Estimación en directo';
  $('pitchChartSource').textContent='Provisional · Pitchy · muestras de audio sin compresión';
  recording=true;document.body.dataset.session='recording';view('recording');context.createMediaStreamSource(stream).connect(capture);
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
 cleanupCapture();$('pitchValue').textContent='—';$('pitchLiveState').textContent='Grabación terminada';$('pitchToneMarker').hidden=true;
 const length=chunks.reduce((n,c)=>n+c.length,0);if(!length){busy=false;document.body.dataset.session='done';view('setup');controls();status('No se capturó audio. Vuelve a intentarlo.');return;}
 const raw=new Float32Array(length);let offset=0;for(const c of chunks){raw.set(c,offset);offset+=c.length;}chunks=[];
 duration=length/rate;setAudio(new Blob([wav16(raw,rate)],{type:'audio/wav'}));
 summary('Resumen provisional · Pitchy en directo · pendiente de Praat');
 if(incomplete){busy=false;document.body.dataset.session='done';controls();status('No se confirmó el final de la captura. Conservamos un WAV que podría estar incompleto; no se envía automáticamente a Praat.');return;}
 processing('Preparando tu muestra…');
 try{const ready=await prepare(blob);prepared=ready.wav;await finalAnalysis();}
 catch(e){busy=false;document.body.dataset.session='done';processing(null);controls();status(`${e.message} Conservamos la grabación.`);}
}
async function upload(event){
 const file=event.target.files[0];event.target.value='';if(!file||busy)return;
 if(file.size>20*1024*1024){status('El archivo supera el límite de 20 MB.');return;}
 busy=true;controls();document.body.dataset.session='processing';processing('Preparando el audio…');
 try{const configuration=readConfiguration(),ready=await prepare(file);limits=configuration.limits;task=configuration.task;prepared=ready.wav;duration=ready.duration;points=[];sourceKind='import';setAudio(file);summary('Audio importado · pendiente de Praat · sin estimación en directo');await finalAnalysis();}
 catch(e){status(e.message);busy=false;document.body.dataset.session='done';processing(null);controls();}
}
function hover(event){
 if(recording||!duration)return;const rect=$('pitchChart').getBoundingClientRect(),time=timeAtX(event.clientX-rect.left,rect.width,duration),p=nearestPoint(points,time);
 $('pitchHover').textContent=`${time.toFixed(2)} s · ${p&&Math.abs(p.time-time)<.12&&p.hz!==null?`${Math.round(p.hz)} Hz`:'sin estimación en ese momento'}`;
 return time;
}
$('pitchRecord').addEventListener('click',start);$('pitchStop').addEventListener('click',stop);$('pitchUpload').addEventListener('change',upload);
$('pitchRetry').addEventListener('click',()=>{if(!busy&&prepared)return finalAnalysis();});
$('pitchAgain').addEventListener('click',()=>{if(!busy){$('pitchAudio').pause();view('setup');$('pitchResults').hidden=true;draw();}});
$('pitchTask').addEventListener('change',()=>{$('pitchTaskAdvice').textContent=advice[$('pitchTask').value];});
$('pitchHome').addEventListener('click',()=>{if(!busy){$('pitchAudio').pause();$('pitchSurface').hidden=true;$('modeHome').hidden=false;}});
$('pitchChart').addEventListener('pointermove',hover);
$('pitchChart').addEventListener('click',event=>{const time=hover(event);if(time!==undefined&&blob){$('pitchAudio').currentTime=time;$('pitchAudio').play().catch(()=>status('Pulsa reproducir para escuchar la muestra.'));draw();}});
$('pitchChart').addEventListener('keydown',event=>{if(recording||!blob||!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();$('pitchAudio').currentTime=Math.max(0,Math.min(duration,event.key==='Home'?0:event.key==='End'?duration:$('pitchAudio').currentTime+(event.key==='ArrowRight'?.5:-.5)));draw();});
$('pitchAudio').addEventListener('timeupdate',draw);$('pitchAudio').addEventListener('loadedmetadata',draw);window.addEventListener('resize',draw);
window.addEventListener('pagehide',()=>{aborter?.abort();cleanupCapture();if(audioURL)URL.revokeObjectURL(audioURL);});
controls();
