import { countWords, formatTime, acousticActivity, LiveWordTracker,
  finalMetrics, sharedChartScale, intervalAt, speedZone, therapySummary, therapyPresets, PauseGate } from './analysis.mjs';
const $ = id => document.getElementById(id);
let state = 'idle', recorder, stream, recognition, clock, audioContext, worker, job = 0, workerTimeout;
let started = 0, session = 0, finalText = '', interimText = '', completedRecognition = '', liveSupported = true;
let tracker = new LiveWordTracker(), selected = 0, playbackEnd = null;
const samples = [null, null];
let analyser=null,micSource=null,micFrame=null,pauseGate=new PauseGate(),runStart=0;
let stoppedSnapshot=null;
let target = {min:120,max:187}, liveBins=[], liveDuration=0, liveValue=null, lastLiveUpdate=null, lastReceivedText='';
const zoneLabels={slow:'LENTO',target:'OBJETIVO',fast:'RÁPIDO',unknown:'Sin estimación'};
function readTarget() {
  const min=Number($('targetMin').value),max=Number($('targetMax').value);
  if(!Number.isFinite(min)||!Number.isFinite(max)||min<=0||max<=min||max>1000) {
    setStatus('Elige un rango válido: mínimo mayor que cero y máximo mayor que mínimo (hasta 1000 ppm).'); return null;
  }
  return {min,max};
}
function feedback(recent) {
  if(state!=='recording') {
    $('speedMarker').hidden=true;$('speedMeter').dataset.zone='unknown';
    const processing=['stopping','processing'].includes(state);
    const labels={done:'Práctica terminada',error:'Práctica detenida',starting:'Preparando micrófono…'};
    $('feedbackLabel').textContent=processing?'Grabación terminada':labels[state]||'Habla y sigue tu ritmo';
    $('feedbackValue').textContent=processing?'Resumen provisional abajo · análisis final pendiente':state==='done'?'Consulta el resumen final y escucha los tramos abajo.':'El medidor funciona durante la grabación.';
    $('speedMeter').setAttribute('aria-label','Medidor en directo inactivo');return;
  }
  const zone=speedZone(recent,target);
  $('speedMeter').dataset.zone=zone;
  $('speedMeter').setAttribute('aria-label', `${zoneLabels[zone]} · estimación provisional respecto al objetivo ${target.min}–${target.max} ppm`);
  $('feedbackLabel').textContent=zone==='unknown'?'Habla y sigue tu ritmo':({slow:'Puedes acelerar un poco',target:'Buen ritmo',fast:'Un poco más despacio'})[zone];
  $('feedbackValue').textContent=zone==='unknown'?'Sin estimación disponible':`${Math.round(recent)} ppm estimadas · objetivo ${target.min}–${target.max}`;
  $('speedMarker').hidden=zone==='unknown';
  const position=recent<target.min?recent/target.min/3:recent<=target.max?1/3+(recent-target.min)/(target.max-target.min)/3:2/3+(recent-target.max)/target.max/3;
  $('speedMarker').style.left=`${Math.max(1,Math.min(99,position*100))}%`;
}
function renderTherapy() {
  const sample=samples[selected], result=sample?.result, provisional=sample?.provisional;
  const source=provisional||result;
  const isFinalSource=!provisional && !!result;
  const goal=sample?.target||target;
  $('therapyTimeline').replaceChildren();
  $('therapySummary').hidden=!source;
  if(!source) {
    for(const id of ['targetPercent','slowPercent','fastPercent','therapyMean','longestTarget','therapyPauseInfo'])$(id).textContent='—';
    $('summarySource').textContent='Aún no hay muestra.'; $('coverageNotice').textContent=''; return;
  }
  const summary=therapySummary(source.bins,source.duration,goal);
  $('timelineEnd').textContent=formatTime(source.duration);
  $('summaryTitle').textContent=isFinalSource?'Resumen del audio analizado':'Resumen de la práctica · provisional';
  $('summarySource').textContent=isFinalSource?`Whisper · intervalos de ${intervalWidth()} s · objetivo ${goal.min}–${goal.max} ppm. Puede diferir del directo.`:`Feedback observado durante la práctica · objetivo ${goal.min}–${goal.max} ppm. El análisis del audio se actualiza aparte.`;
  for(const [id,zone] of [['targetPercent','target'],['slowPercent','slow'],['fastPercent','fast']])$(id).textContent=`${summary.seconds[zone].toFixed(1)} s`;
  $('therapyMean').textContent=Number.isFinite(source.mean)?`${Math.round(source.mean)} ppm`:'—';
  $('longestTarget').textContent=`${summary.longest.toFixed(1)} s`;
  $('therapyPauseInfo').textContent=result?`${result.activity.pauses.length} pausas · ${result.activity.silence.toFixed(1)} s`:'Pendiente del audio';
  $('coverageNotice').textContent=`Tiempo sin estimación: ${summary.seconds.unknown.toFixed(1)} s (incluye pausas probables en directo). El periodo en objetivo es una estimación por tramos, no una medida clínicamente validada.`;
  const visible=[];let cursor=0;
  for(const b of summary.timeline) {
    if(b.start>cursor)visible.push({start:cursor,end:b.start,zone:'unknown'});
    const last=visible.at(-1);
    if(!isFinalSource && last?.zone===b.zone && Math.abs(last.end-b.start)<.001)last.end=b.end;
    else visible.push({...b});
    cursor=b.end;
  }
  if(cursor<source.duration)visible.push({start:cursor,end:source.duration,zone:'unknown'});
  for(const b of visible) {
    const button=document.createElement('button');button.className=`zone-${b.zone}`;
    button.style.flex=String(b.end-b.start);button.textContent='';
    button.title=`${formatTime(b.start)}–${formatTime(b.end)} · ${zoneLabels[b.zone]}`;button.setAttribute('aria-label',button.title);
    button.disabled=!isFinalSource||b.zone==='unknown';
    button.addEventListener('click',()=>playInterval(selected,b));$('therapyTimeline').append(button);
  }
}
function snapshotLive() {
  const duration=(performance.now()-started)/1000;
  return {duration,mean:liveSupported?countWords(liveText())*60/duration:null,bins:liveBins.map(b=>({...b}))};
}
const chartLayouts = new Map();
const intervalWidth = () => Number($('intervalSelect').value);
const setStatus = text => $('statusText').textContent = text;
const busy = () => ['starting', 'recording', 'stopping', 'processing'].includes(state);

let processingReminder=null;
const processingPhases=['Preparando audio','Transcribiendo','Calculando velocidad y pausas','Generando resultados'];
function showProcessing(step,detail,percent=null){
  $('processingStep').textContent=`Paso ${step} de 4`;
  $('processingPhase').textContent=processingPhases[step-1];
  $('processingBar').setAttribute('aria-label',processingPhases[step-1]);
  const known=Number.isFinite(percent);
  $('processingBar').dataset.mode=known?'determinate':'indeterminate';
  if(known){const value=Math.max(0,Math.min(100,percent));$('processingBar').setAttribute('aria-valuenow',String(value));$('processingFill').style.width=`${value}%`;}
  else{$('processingBar').removeAttribute('aria-valuenow');$('processingFill').style.width='';}
  $('processingDetail').textContent=detail;
}
// Yield before short synchronous calculations so the new phase can paint.
const paintProcessing=()=>new Promise(resolve=>setTimeout(resolve,0));
function setState(next) {
  const wasProcessing=['stopping','processing'].includes(state);
  state = next;
  const analyzing=['stopping','processing'].includes(next);
  $('processingPanel').hidden=!analyzing;
  if(analyzing&&!wasProcessing){
    showProcessing(1,'Conservando la grabación y preparando el audio completo.');
    $('processingReassurance').textContent='El análisis continúa en esta pestaña.';
    processingReminder=setTimeout(()=>{$('processingReassurance').textContent='Seguimos procesando… En algunos equipos puede tardar un poco más. No cierres la pestaña.';},20000);
  }
  if(!analyzing){clearTimeout(processingReminder);processingReminder=null;}

  $('recordBtn').disabled = busy();
  $('stopBtn').disabled = next !== 'recording';
  $('fileInput').disabled = $('sampleSelect').disabled = $('intervalSelect').disabled = busy();
  $('retryBtn').disabled = !samples[selected]?.blob || busy();
  $('targetMin').disabled = $('targetMax').disabled = $('presetSelect').disabled = $('populationSelect').disabled = busy();
  document.body.dataset.session=next;
  const practicing=next==='recording';
  $('patientPanel').hidden=!practicing;
  $('setupPanel').hidden=practicing||next==='stopping'||next==='processing';
  $('professionalArea').hidden=practicing||analyzing;
  document.querySelector('.app-header').hidden=practicing;
  if(practicing){$('therapySummary').hidden=true;$('professionalArea').open=false;}
  if(next==='done'||next==='error')$('setupPanel').open=false;
  if(next==='error'&&wasProcessing)$('professionalArea').open=true;
  if(next==='idle'||next==='starting')$('setupPanel').open=true;
  if(next!=='recording')feedback(null);
}
function resetResults() {
  for (const id of ['totalDuration','wordCount','wpm','speechDuration','silenceDuration','pauseCount']) $(id).textContent = '—';
  $('finalTranscript').textContent = 'Pendiente del reprocesamiento del audio.';
  $('segmentRows').replaceChildren(); $('pauses').textContent = '—';
  $('chartNotice').textContent = 'Intervalos reales según marcas por palabra. Pulsa una barra o un tramo para escucharlo.';
}
function clearLive() {
  completedRecognition = finalText = interimText = '';
  tracker = new LiveWordTracker(); liveBins=[]; liveDuration=0; liveValue=null; lastLiveUpdate=null;lastReceivedText='';stoppedSnapshot=null;pauseGate=new PauseGate();runStart=0;
  feedback(null);
  for (const id of ['liveSpeed','liveCount','recentSpeed']) $(id).textContent = '—';
  $('timer').textContent = $('visibleTimer').textContent = '00:00';
  $('liveTranscript').textContent = 'La transcripción aparecerá al hablar.';
}
function stopPlayback() { $('playback').pause(); playbackEnd = null; }
function showAudio() {
  stopPlayback();
  const sample = samples[selected];
  if (sample) {
    $('playback').src = sample.url;
    $('downloadAudio').href = sample.url;
    $('downloadAudio').download = sample.filename;
    $('downloadAudio').hidden = false;
  } else {
    $('playback').removeAttribute('src'); $('playback').load();
    $('downloadAudio').hidden = true;
  }
}
function attachAudio(blob) {
  const old = samples[selected];
  if (old) URL.revokeObjectURL(old.url);
  const extension = blob.type.includes('mp4') ? 'm4a' : blob.type.includes('wav') ? 'wav' : blob.type.includes('mpeg') ? 'mp3' : 'webm';
  samples[selected] = { blob, url: URL.createObjectURL(blob), result: null,
    filename: blob.name || `fluidez-${selected ? 'B' : 'A'}-${Date.now()}.${extension}` };
  showAudio();
}
function releaseMic() {
  micSource?.disconnect();micSource=null;analyser=null;micFrame=null;
  stream?.getTracks().forEach(track => track.stop()); stream = null;
}
async function monitorMic() {
  try {
    audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
    await audioContext.resume();
    analyser=audioContext.createAnalyser();analyser.fftSize=2048;
    micFrame=new Float32Array(analyser.fftSize);
    micSource=audioContext.createMediaStreamSource(stream);micSource.connect(analyser);
    // Output intentionally unconnected: no microphone playback/feedback loop.
  } catch {
    analyser=null;micSource?.disconnect();micSource=null;
    $('liveNotice').textContent+=' No se pudo monitorizar la energía: no hay neutralización acústica de pausas.';
  }
}
function liveText() { return `${completedRecognition} ${finalText} ${interimText}`.trim(); }
function tick() {
  const elapsed = (performance.now() - started) / 1000;
  const words = countWords(liveText());
  $('timer').textContent = $('visibleTimer').textContent = formatTime(elapsed);
  $('liveCount').textContent = liveSupported ? String(words) : '—';
  $('liveSpeed').textContent = liveSupported && elapsed >= 3 ? `${Math.round(words * 60 / elapsed)} ppm` : '—';
  let paused=false;
  if(analyser && audioContext.state==='running') {
    analyser.getFloatTimeDomainData(micFrame);
    const rms=Math.sqrt(micFrame.reduce((sum,x)=>sum+x*x,0)/micFrame.length);
    const gate=pauseGate.update(rms,elapsed);paused=gate.paused;
    if(gate.resumed){runStart=elapsed;lastLiveUpdate=null;}
  }
  // Measure at text arrival, not at each UI tick: absence of new data is not
  // evidence of slower speech. Hold briefly, then the freshness gate hides it.
  const recent = lastLiveUpdate===null?null:tracker.recent(lastLiveUpdate,lastLiveUpdate-runStart);
  $('recentSpeed').textContent = liveSupported && recent !== null && lastLiveUpdate!==null && elapsed-lastLiveUpdate<=5 && !paused ? `${Math.round(recent)} ppm` : '—';
  $('liveTranscript').textContent = liveText() || 'Esperando voz…';
  const fresh=lastLiveUpdate!==null && elapsed-lastLiveUpdate<=5;
  const value=liveSupported && tracker.entries.length && fresh && !paused?recent:null;
  if(state==='recording' && elapsed>liveDuration) {
    liveBins.push({start:liveDuration,end:elapsed,wpm:liveValue});liveDuration=elapsed;
  }
  liveValue=value; feedback(value);
  if(state==='recording' && paused){
    $('feedbackLabel').textContent='Pausa probable';
    $('feedbackValue').textContent='Tómate tu tiempo. El medidor queda neutral mientras no detecta actividad suficiente.';
  } else if(state==='recording' && runStart>0 && recent===null){
    $('feedbackLabel').textContent='Retomando el habla';
    $('feedbackValue').textContent='Esperando texto y al menos 3 s de muestra nueva.';
  } else if(state==='recording' && liveSupported && !fresh && lastLiveUpdate!==null) {
    $('feedbackLabel').textContent='Esperando actualización de voz';
    $('feedbackValue').textContent='No hay texto nuevo desde hace más de 5 s. No podemos distinguir una pausa de un retraso del reconocimiento.';
  }
}
function startRecognition(token) {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  liveSupported = !!Recognition;
  if (!Recognition) {
    $('liveNotice').textContent = 'Sin reconocimiento en directo en este navegador. Puedes grabar y obtener el análisis final; prueba Chrome o Edge para el directo.';
    return;
  }
  const instance = new Recognition(); recognition = instance;
  instance.lang = 'es-ES'; instance.continuous = true; instance.interimResults = true;
  instance.onresult = event => {
    if (token !== session || !['recording','stopping'].includes(state)) return;
    finalText = ''; interimText = '';
    for (const result of event.results) {
      if (result.isFinal) finalText += result[0].transcript + ' ';
      else interimText += result[0].transcript + ' ';
    }
    // Arrival times only; never reused for final word timestamps.
    const arrival=(performance.now()-started)/1000;
    if(liveText()!==lastReceivedText){lastLiveUpdate=arrival;lastReceivedText=liveText();}
    tracker.update(liveText(), arrival);
    tick();
  };
  let blocked = false;
  instance.onerror = event => {
    if (token !== session) return;
    $('liveNotice').textContent = `Reconocimiento en directo: ${event.error}. El audio sigue grabándose.`;
    if (['not-allowed','service-not-allowed','audio-capture','network'].includes(event.error)) {
      blocked = true; liveSupported = false; tick();
    }
  };
  instance.onend = () => {
    if (token !== session) return;
    completedRecognition += finalText; finalText = ''; interimText = '';
    tracker.update(liveText(), (performance.now() - started) / 1000);
    if (state === 'recording' && !blocked) {
      try { instance.start(); } catch {
        liveSupported = false; tick();
        $('liveNotice').textContent = 'El reconocimiento se ha detenido; el audio continúa grabándose.';
      }
    }
  };
  try { instance.start(); } catch {
    liveSupported = false;
    $('liveNotice').textContent = 'No se inició el reconocimiento. El análisis final utilizará el audio grabado.';
  }
}
async function startRecording() {
  const goal=readTarget();if(!goal)return;target=goal;
  stopPlayback(); setState('starting'); const token = ++session;
  clearLive(); resetResults(); $('therapySummary').hidden=true; $('summarySource').textContent='Práctica en curso · resumen al detener'; $('therapyTimeline').replaceChildren();
  for(const id of ['targetPercent','slowPercent','fastPercent','therapyMean','longestTarget','therapyPauseInfo'])$(id).textContent='—'; $('coverageNotice').textContent=''; $('playback').removeAttribute('src'); $('playback').load(); $('downloadAudio').hidden = true; drawAllCharts();
  $('analysisTag').textContent = 'Provisional';
  $('liveNotice').textContent = 'Ambas velocidades son provisionales. La reciente usa la llegada del texto de hasta 15 s desde la última pausa probable; los retrasos y revisiones pueden causar saltos.';
  setStatus(`Solicitando micrófono · muestra ${selected ? 'B' : 'A'}…`);
  try {
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) throw Error('Necesitas un navegador compatible y HTTPS.');
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    await monitorMic();
    const mime = ['audio/webm;codecs=opus','audio/mp4','audio/webm'].find(t => MediaRecorder.isTypeSupported(t));
    const activeRecorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    recorder = activeRecorder; const chunks = [];
    activeRecorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
    activeRecorder.onerror = () => {
      clearInterval(clock); recognition?.abort(); releaseMic();
      setState('error'); setStatus('La grabación falló.');
    };
    activeRecorder.onstop = async () => {
      clearInterval(clock); releaseMic();
      if (token !== session) return;
      const provisional=stoppedSnapshot||snapshotLive();
      attachAudio(new Blob(chunks, { type: activeRecorder.mimeType }));
      samples[selected].provisional=provisional; samples[selected].target={...target};
      renderTherapy(); await analyzeFinal();
    };
    activeRecorder.start(1000); started = performance.now();
    setState('recording'); setStatus(`Grabando ${selected ? 'B' : 'A'} · datos provisionales`);
    clock = setInterval(tick, 250); startRecognition(token); tick();
  } catch (error) {
    releaseMic(); setState('error'); $('analysisTag').textContent = 'Error';
    setStatus(`No se pudo grabar: ${error.message}`);
  }
}
function stopRecording() {
  if (state !== 'recording') return;
  tick(); clearInterval(clock);
  const provisional=snapshotLive();stoppedSnapshot=provisional;
  const old=samples[selected];const temporary={provisional,target:{...target}};
  samples[selected]=temporary;renderTherapy();samples[selected]=old;
  setState('stopping'); setStatus('Finalizando grabación…');
  try { recognition?.stop(); } catch { /* Recording must stop even if recognition fails. */ }
  recorder.stop();
}
async function decodeAudio(blob) {
  audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
  const decoded = await audioContext.decodeAudioData(await blob.arrayBuffer());
  const mono = new Float32Array(decoded.length);
  for (let c = 0; c < decoded.numberOfChannels; c++) {
    const channel = decoded.getChannelData(c);
    for (let i = 0; i < mono.length; i++) mono[i] += channel[i] / decoded.numberOfChannels;
  }
  const offline = new OfflineAudioContext(1, Math.ceil(decoded.duration * 16000), 16000);
  const buffer = offline.createBuffer(1, mono.length, decoded.sampleRate);
  buffer.copyToChannel(mono, 0);
  const source = offline.createBufferSource(); source.buffer = buffer;
  source.connect(offline.destination); source.start();
  const resampled = await offline.startRendering();
  return { samples: resampled.getChannelData(0), duration: decoded.duration };
}
function transcribe(audio) {
  return new Promise((resolve, reject) => {
    const id = ++job;
    try { worker ||= new Worker(new URL('./transcriber.worker.js', import.meta.url), { type: 'module' }); }
    catch (error) { reject(error); return; }
    const fail = error => { clearTimeout(workerTimeout); worker?.terminate(); worker = null; reject(error); };
    worker.onerror = () => fail(Error('No se pudo cargar el motor; comprueba conexión y descarga del modelo.'));
    worker.onmessage = ({ data }) => {
      if (data.id !== id) return;
      if (data.type === 'result') { clearTimeout(workerTimeout); resolve(data.output); }
      else if (data.type === 'error') fail(Error(data.message));
      else if (data.type === 'progress') {
        const p = data.progress;
        if(p.status==='transcribing')showProcessing(2,'Transcribiendo el audio completo en este dispositivo.');
        else {
          const value=Number.isFinite(p.progress)?p.progress:null;
          const file=p.file||'archivo del modelo';
          showProcessing(2,value===null?'Preparando el motor local. La primera vez necesita descargar el modelo.':`Descargando ${file} · ${Math.round(value)} % de este archivo (no del análisis completo).`,value);
        }
        $('finalNotice').textContent = p.status === 'transcribing' ? 'Transcribiendo el audio completo…' :
          `Preparando modelo local${Number.isFinite(p.progress) ? ` · ${Math.round(p.progress)} %` : ''}.`;
      }
    };
    workerTimeout = setTimeout(() => fail(Error('El análisis excedió 15 minutos; el audio sigue disponible.')), 900000);
    const copy = audio.slice(); worker.postMessage({ id, audio: copy }, [copy.buffer]);
  });
}
async function analyzeFinal() {
  const sample = samples[selected]; if (!sample) return;
  stopPlayback(); setState('processing'); resetResults(); sample.result = null; renderTherapy(); drawAllCharts();
  $('analysisTag').textContent = 'Procesando audio completo';
  setStatus('Reprocesando · resultado final pendiente');
  try {
    const { samples: audio, duration } = await decodeAudio(sample.blob);
    if (!Number.isFinite(duration) || duration <= 0 || !audio.length) throw Error('El archivo no contiene audio válido.');
    showProcessing(2,'Preparando el motor de transcripción local.');
    // Even activity.speech === 0 must reach the independent transcription engine.
    const output = await transcribe(audio);
    showProcessing(3,'Calculando la velocidad y las pausas del audio completo.');await paintProcessing();
    const activity = acousticActivity(audio, 16000);
    sample.result = { duration, activity, output, ...finalMetrics(output, duration, intervalWidth()) };
    showProcessing(4,'Preparando los gráficos y los resultados.');await paintProcessing();
    setState('done'); renderSelected(); renderComparison(); renderTherapy();
    setStatus('Análisis final completado');
  } catch (error) {
    setState('error'); $('analysisTag').textContent = 'Análisis final incompleto';
    $('finalNotice').textContent = `No se completó: ${error.message}. Audio conservado; puedes reintentar. Los datos provisionales no sustituyen al final.`;
    setStatus('Audio conservado · análisis final incompleto'); renderComparison(); renderTherapy();
  }
}
function renderSelected() {
  resetResults(); renderTherapy(); const result = samples[selected]?.result;
  if (!result) {
    $('analysisTag').textContent = samples[selected] ? 'Sin resultado final' : 'Sin análisis';
    $('finalNotice').textContent = 'El audio se conserva temporalmente en esta pestaña.';
    drawAllCharts(); return;
  }
  const { duration, activity, words, mean, bins, output } = result;
  $('totalDuration').textContent = `${formatTime(duration)} · ${duration.toFixed(1)} s`;
  $('wordCount').textContent = String(words); $('wpm').textContent = `${Math.round(mean)} ppm`;
  $('speechDuration').textContent = `${activity.speech.toFixed(1)} s`;
  $('silenceDuration').textContent = `${activity.silence.toFixed(1)} s`;
  $('pauseCount').textContent = String(activity.pauses.length);
  $('pauses').textContent = activity.pauses.length ? activity.pauses.map(p =>
    `${formatTime(p.start)}–${formatTime(p.end)} (${p.duration.toFixed(2)} s)`).join(' · ') : 'Sin pausas internas detectadas de 0,5 s o más.';
  $('finalTranscript').textContent = output.text?.trim() || 'No se reconocieron palabras.';
  if (!bins) $('chartNotice').textContent = 'Sin gráfico temporal: faltan tiempos válidos para algunas palabras o no concuerda el recuento. No se inventa su distribución.';
  else for (const bin of bins) {
    const row = document.createElement('tr'); row.dataset.start = String(bin.start); row.dataset.end = String(bin.end);
    const cell = document.createElement('td'), button = document.createElement('button');
    button.className = 'segment-button'; button.textContent = `▶ ${formatTime(bin.start)}–${formatTime(bin.end)}`;
    button.addEventListener('click', () => playInterval(selected, bin)); cell.append(button); row.append(cell);
    for (const text of [String(bin.words), bin.wpm.toFixed(1)]) { const td = document.createElement('td'); td.textContent = text; row.append(td); }
    // The whole row is clickable; the button also provides keyboard accessibility.
    row.addEventListener('click', event => { if (event.target !== button) playInterval(selected, bin); });
    $('segmentRows').append(row);
  }
  $('analysisTag').textContent = 'Resultado final automático';
  $('finalNotice').textContent = 'Audio completo procesado con Whisper Base; palabras, tiempos y actividad acústica automáticos, no validados clínicamente.';
  if (activity.speech === 0 && words > 0) $('finalNotice').textContent += ' El detector acústico no encontró actividad, pero Whisper reconoció palabras: habla/silencio requieren cautela.';
  if (activity.speech === 0 && words === 0) $('finalNotice').textContent += ' Whisper intentó transcribir el audio y no devolvió palabras.';
  drawAllCharts();
}
function renderComparison() {
  const results = samples.map(s => s?.result); $('comparisonRows').replaceChildren();
  $('comparisonNotice').textContent = results.every(Boolean) ?
    'Comparación automática con los mismos ejes e intervalos. Diferencias descriptivas, sin interpretación clínica.' :
    'Analiza una muestra en A y otra en B. Ambas se conservan temporalmente en esta pestaña.';
  const rows = [
    ['Duración', r => `${r.duration.toFixed(1)} s`], ['Velocidad media', r => `${r.mean.toFixed(1)} ppm`],
    ['Palabras', r => String(r.words)], ['Pausas internas ≥ 0,5 s', r => String(r.activity.pauses.length)],
    ['Actividad acústica estimada', r => `${r.activity.speech.toFixed(1)} s`],
    ['Silencio estimado', r => `${r.activity.silence.toFixed(1)} s (${(r.activity.silence/r.duration*100).toFixed(1)} %)`],
    ['Tiempos por palabra', r => r.bins ? 'Disponibles' : 'Incompletos; gráfico no disponible']
  ];
  for (const [name, getter] of rows) {
    const row = document.createElement('tr');
    for (const text of [name, ...results.map(r => r ? getter(r) : '—')]) {
      const cell = document.createElement('td'); cell.textContent = text; row.append(cell);
    }
    $('comparisonRows').append(row);
  }
  drawAllCharts();
}
function drawChart(id, result, scale, color, slot) {
  const canvas = $(id), ctx = canvas.getContext('2d'), w = canvas.clientWidth || 600, h = 260;
  const dpr = window.devicePixelRatio || 1; canvas.width = w*dpr; canvas.height = h*dpr; ctx.scale(dpr,dpr);
  const textColor = getComputedStyle(document.body).getPropertyValue('--text');
  ctx.fillStyle = textColor; ctx.font = '12px system-ui'; chartLayouts.delete(id);
  if (!result?.bins) { ctx.fillText(result ? 'Marcas temporales incompletas' : 'Pendiente del análisis final', 20, 40); return; }
  const left = 45, right = w-15, top = 25, bottom = h-40;
  chartLayouts.set(id, { left, right, top, bottom, duration: scale.duration, bins: result.bins, slot });
  for (let i=0;i<=4;i++) {
    const y=bottom-(bottom-top)*i/4; ctx.strokeStyle='#94a3b855'; ctx.beginPath();ctx.moveTo(left,y);ctx.lineTo(right,y);ctx.stroke();
    ctx.fillStyle=textColor;ctx.fillText(String(Math.round(scale.max*i/4)),2,y+4);
    const t=scale.duration*i/4;ctx.fillText(formatTime(t),left+(right-left)*i/4-12,bottom+22);
  }
  const activeTime = slot === selected ? $('playback').currentTime : -1;
  for (const b of result.bins) {
    const x=left+b.start/scale.duration*(right-left), width=(b.end-b.start)/scale.duration*(right-left);
    const height=b.wpm/scale.max*(bottom-top);
    ctx.fillStyle=color;ctx.fillRect(x+width*.08,bottom-height,width*.84,height);
    if (activeTime>=b.start && activeTime<b.end) {ctx.strokeStyle=textColor;ctx.lineWidth=2;ctx.strokeRect(x+width*.08,top,width*.84,bottom-top);ctx.lineWidth=1;}
  }
  const y=bottom-result.mean/scale.max*(bottom-top);ctx.strokeStyle='#c27616';ctx.setLineDash([5,4]);ctx.beginPath();ctx.moveTo(left,y);ctx.lineTo(right,y);ctx.stroke();ctx.setLineDash([]);
  ctx.fillStyle=textColor;ctx.fillText('ppm · línea discontinua = media',left,14);
}
function drawAllCharts() {
  const results=samples.map(s=>s?.result), shared=sharedChartScale(results);
  const current=['starting','recording','stopping'].includes(state)?null:results[selected];
  drawChart('speedChart',current,sharedChartScale([current]),selected?'#8757cc':'#2d7ff9',selected);
  drawChart('chartA',results[0],shared,'#2d7ff9',0);drawChart('chartB',results[1],shared,'#8757cc',1);
}
function selectSample(slot) {
  if (busy()) return;
  selected=slot;$('sampleSelect').value=String(slot);clearLive();showAudio();
  setState(samples[slot]?.result?'done':'idle');renderSelected();renderComparison();
  setStatus(`Muestra ${slot?'B':'A'} seleccionada`);
}
async function playInterval(slot, bin) {
  if (busy() || !samples[slot]?.result) return;
  if (slot!==selected) selectSample(slot);
  stopPlayback();playbackEnd=bin.end;
  const audio=$('playback');audio.currentTime=bin.start;
  try { await audio.play(); } catch {
    playbackEnd=null;setStatus('No se pudo iniciar la reproducción; utiliza el reproductor.');
  }
}
for (const id of ['speedChart','chartA','chartB']) $(id).addEventListener('click',event=>{
  if (busy()) return;
  const layout=chartLayouts.get(id);if(!layout)return;
  const rect=$(id).getBoundingClientRect();const x=(event.clientX-rect.left)*($(id).clientWidth/rect.width),y=event.clientY-rect.top;
  if(x<layout.left||x>=layout.right||y<layout.top||y>layout.bottom)return;
  const time=(x-layout.left)/(layout.right-layout.left)*layout.duration;
  const bin=intervalAt(time,layout.bins);if(bin)playInterval(layout.slot,bin);
});
$('playback').addEventListener('timeupdate',()=>{
  const audio=$('playback');if(playbackEnd!==null&&audio.currentTime>=playbackEnd){audio.pause();playbackEnd=null;}
  for(const row of $('segmentRows').children)row.classList.toggle('active-segment',audio.currentTime>=Number(row.dataset.start)&&audio.currentTime<Number(row.dataset.end));
  drawAllCharts();
});
$('playback').addEventListener('ended',()=>{playbackEnd=null;});
$('intervalSelect').addEventListener('change',()=>{
  stopPlayback();for(const sample of samples)if(sample?.result)Object.assign(sample.result,finalMetrics(sample.result.output,sample.result.duration,intervalWidth()));
  renderSelected();renderComparison();
});
$('sampleSelect').addEventListener('change',()=>selectSample(Number($('sampleSelect').value)));
$('recordBtn').addEventListener('click',startRecording);$('stopBtn').addEventListener('click',stopRecording);
$('retryBtn').addEventListener('click',analyzeFinal);
$('fileInput').addEventListener('change',async event=>{
  const file=event.target.files[0];if(!file||busy())return;
  const goal=readTarget();if(!goal){event.target.value='';return;}target=goal;
  ++session;clearLive();attachAudio(file);samples[selected].target={...target};$('liveTranscript').textContent='Archivo importado: sin transcripción en directo.';
  await analyzeFinal();event.target.value='';
});
$('themeSwitch').addEventListener('click',()=>{document.body.dataset.theme=document.body.dataset.theme==='dark'?'light':'dark';drawAllCharts();});
window.addEventListener('resize',drawAllCharts);
$('professionalDetails').addEventListener('toggle',drawAllCharts);
$('professionalArea').addEventListener('toggle',drawAllCharts);
$('comparisonPanel').addEventListener('toggle',drawAllCharts);
window.addEventListener('beforeunload',()=>{
  clearInterval(clock);recognition?.abort();releaseMic();worker?.terminate();
  for(const sample of samples)if(sample)URL.revokeObjectURL(sample.url);
});
function updateGoalDisplay() {
  const min=Number($('targetMin').value),max=Number($('targetMax').value);
  $('goalDisplay').textContent=min>0&&max>min?`${min}–${max} ppm`:'Elige un objetivo';
}
function applyPreset() {
  const preset=therapyPresets[$('presetSelect').value];
  if(preset){$('targetMin').value=String(preset.min);$('targetMax').value=String(preset.max);}
  updateGoalDisplay();
}
$('presetSelect').addEventListener('change',applyPreset);
$('populationSelect').addEventListener('change',()=>{
  const child=$('populationSelect').value==='child';
  for(const option of $('presetSelect').options)option.disabled=child&&option.value!=='custom';
  $('presetSelect').value=child?'custom':'conversation';
  if(child){$('targetMin').value='';$('targetMax').value='';document.querySelector('.goal-details').open=true;}
  $('referenceNotice').textContent=child?'No se aplica una referencia adulta. Define el objetivo de esta tarea con el logopeda.':'Referencia descriptiva P10–P90: 60 adultos de 21–30 años de Puerto Rico. Incluye pausas; no son límites diagnósticos ni referencias para España, niños o ventanas de 15 s.';
  applyPreset();
});
for(const id of ['targetMin','targetMax'])$(id).addEventListener('input',()=>{$('presetSelect').value='custom';updateGoalDisplay();});
updateGoalDisplay();
setState('idle');renderComparison();drawAllCharts();renderTherapy();feedback(null);
