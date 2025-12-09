// Core elements
const recordBtn = document.getElementById('recordBtn');
const stopBtn = document.getElementById('stopBtn');
const fileInput = document.getElementById('fileInput');
const playback = document.getElementById('playback');
const analyzeBtn = document.getElementById('analyzeBtn');
const transcriptInput = document.getElementById('transcriptInput');
const wordCountInput = document.getElementById('wordCountInput');
const syllableEstimate = document.getElementById('syllableEstimate');
const statusText = document.getElementById('statusText');
const analysisTag = document.getElementById('analysisTag');
const themeSwitch = document.getElementById('themeSwitch');
const canvas = document.getElementById('waveCanvas');
const canvasCtx = canvas.getContext('2d');

let mediaRecorder;
let audioChunks = [];
let audioContext;
let analyser;
let sourceNode;
let animationId;
let recognition;
let recognitionTranscript = '';
let recordedBlob = null;

// Utility: format seconds into mm:ss
const formatTime = (seconds) => {
  if (!Number.isFinite(seconds)) return '—';
  const minutes = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60).toString().padStart(2, '0');
  return `${minutes}:${secs}`;
};

// Update status banner
const setStatus = (message) => {
  statusText.textContent = message;
};

// Draw live waveform level
const drawWaveform = () => {
  if (!analyser) return;
  const bufferLength = analyser.fftSize;
  const dataArray = new Uint8Array(bufferLength);

  const draw = () => {
    analyser.getByteTimeDomainData(dataArray);
    canvasCtx.fillStyle = '#e2e8f0';
    canvasCtx.fillRect(0, 0, canvas.width, canvas.height);
    canvasCtx.lineWidth = 2;
    canvasCtx.strokeStyle = '#2d7ff9';
    canvasCtx.beginPath();

    const sliceWidth = (canvas.width * 1.0) / bufferLength;
    let x = 0;

    for (let i = 0; i < bufferLength; i++) {
      const v = dataArray[i] / 128.0;
      const y = (v * canvas.height) / 2;

      if (i === 0) {
        canvasCtx.moveTo(x, y);
      } else {
        canvasCtx.lineTo(x, y);
      }

      x += sliceWidth;
    }

    canvasCtx.lineTo(canvas.width, canvas.height / 2);
    canvasCtx.stroke();
    animationId = requestAnimationFrame(draw);
  };

  draw();
};

// Stop waveform drawing
const stopWaveform = () => {
  if (animationId) cancelAnimationFrame(animationId);
  canvasCtx.clearRect(0, 0, canvas.width, canvas.height);
};

// Initialize audio context and analyser
const ensureAudioContext = () => {
  if (!audioContext) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (!analyser) {
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 1024;
  }
};

// Handle theme switching
const toggleTheme = () => {
  const nextTheme = document.body.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  document.body.setAttribute('data-theme', nextTheme);
};

themeSwitch.addEventListener('click', toggleTheme);

// Handle microphone recording
const startRecording = async () => {
  try {
    ensureAudioContext();
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(stream);
    audioChunks = [];
    recognitionTranscript = '';

    // Optional live speech recognition
    if ('webkitSpeechRecognition' in window) {
      recognition = new webkitSpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'es-ES';
      recognition.onresult = (event) => {
        const transcript = Array.from(event.results)
          .map((r) => r[0].transcript)
          .join(' ');
        recognitionTranscript = transcript;
        transcriptInput.value = transcript;
      };
      recognition.start();
    }

    mediaRecorder.ondataavailable = (event) => audioChunks.push(event.data);
    mediaRecorder.onstop = async () => {
      recordedBlob = new Blob(audioChunks, { type: 'audio/webm' });
      stopWaveform();
      await processBlob(recordedBlob);
      setStatus('Grabación detenida. Listo para analizar.');
    };

    mediaRecorder.start();

    // Wire visualization
    sourceNode = audioContext.createMediaStreamSource(stream);
    sourceNode.connect(analyser);
    drawWaveform();

    recordBtn.disabled = true;
    stopBtn.disabled = false;
    setStatus('Grabando…');
  } catch (error) {
    setStatus('No se pudo acceder al micrófono.');
    console.error(error);
  }
};

const stopRecording = () => {
  if (mediaRecorder && mediaRecorder.state === 'recording') {
    mediaRecorder.stop();
  }
  if (recognition) {
    recognition.stop();
  }
  recordBtn.disabled = false;
  stopBtn.disabled = true;
};

// Process uploaded files
const handleFile = async (file) => {
  if (!file) return;
  recordedBlob = file;
  await processBlob(file);
  setStatus('Archivo cargado. Listo para analizar.');
};

// Decode and measure audio
const analyzeAudioBuffer = async (blob) => {
  ensureAudioContext();
  const arrayBuffer = await blob.arrayBuffer();
  const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
  const totalDuration = audioBuffer.duration;
  const speechDuration = detectSpeechDuration(audioBuffer);
  return { totalDuration, speechDuration };
};

// Basic silence trimming: compute RMS and remove low-energy frames
const detectSpeechDuration = (audioBuffer) => {
  const raw = audioBuffer.getChannelData(0);
  const frameSize = 1024;
  const rmsValues = [];
  for (let i = 0; i < raw.length; i += frameSize) {
    const frame = raw.slice(i, i + frameSize);
    const rms = Math.sqrt(frame.reduce((sum, sample) => sum + sample * sample, 0) / frame.length);
    rmsValues.push(rms);
  }

  const sorted = [...rmsValues].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length * 0.5)] || 0;
  const threshold = Math.max(median * 1.5, 0.01);

  const activeFrames = rmsValues.filter((v) => v > threshold).length;
  const frameDuration = frameSize / audioBuffer.sampleRate;
  const speechDuration = activeFrames * frameDuration;

  return Math.min(speechDuration, audioBuffer.duration);
};

// Derive word count from inputs or transcript
const computeWordCount = () => {
  const manualCount = Number(wordCountInput.value);
  if (Number.isFinite(manualCount) && manualCount > 0) return manualCount;

  const transcript = (transcriptInput.value || recognitionTranscript || '').trim();
  if (!transcript) return 0;
  return transcript.split(/\s+/).filter(Boolean).length;
};

// Approximate syllables per word for Spanish text
const estimateSyllablesPerWord = (text) => {
  if (!text) return Number(syllableEstimate.value) || 1.8;
  const words = text.split(/\s+/).filter(Boolean);
  if (!words.length) return Number(syllableEstimate.value) || 1.8;
  const vowels = ['a', 'e', 'i', 'o', 'u', 'á', 'é', 'í', 'ó', 'ú'];
  const syllables = words.reduce((count, word) => {
    const matches = word
      .toLowerCase()
      .split('')
      .reduce((acc, char) => acc + (vowels.includes(char) ? 1 : 0), 0);
    return count + Math.max(matches, 1);
  }, 0);
  return syllables / words.length;
};

// Compute and render metrics
const renderResults = ({ totalDuration, speechDuration, words }) => {
  const minutes = speechDuration / 60;
  const wpm = minutes > 0 ? Math.round(words / minutes) : 0;
  const syllablesPerWord = estimateSyllablesPerWord(transcriptInput.value || recognitionTranscript);
  const syllablesTotal = words * syllablesPerWord;
  const sps = speechDuration > 0 ? (syllablesTotal / speechDuration).toFixed(2) : '0.00';

  document.getElementById('totalDuration').textContent = `${formatTime(totalDuration)} (${totalDuration.toFixed(1)} s)`;
  document.getElementById('speechDuration').textContent = `${formatTime(speechDuration)} (${speechDuration.toFixed(1)} s)`;
  document.getElementById('wordCount').textContent = words ? words.toString() : '—';
  document.getElementById('wpm').textContent = words ? `${wpm} ppm` : '—';
  document.getElementById('sps').textContent = words ? `${sps}` : '—';

  analysisTag.textContent = words ? 'Análisis listo' : 'Falta texto';
};

// Main analysis pipeline
const analyzeSpeech = async () => {
  if (!recordedBlob) {
    setStatus('Sube o graba un audio antes de analizar.');
    return;
  }

  setStatus('Analizando audio…');
  analysisTag.textContent = 'Procesando';

  try {
    const { totalDuration, speechDuration } = await analyzeAudioBuffer(recordedBlob);
    const words = computeWordCount();

    if (!words) {
      setStatus('Añade transcripción o número de palabras para calcular ppm.');
    } else {
      setStatus('Análisis completado.');
    }

    renderResults({ totalDuration, speechDuration, words });
  } catch (error) {
    console.error(error);
    setStatus('No se pudo analizar el audio.');
    analysisTag.textContent = 'Error';
  }
};

// Process and preview audio blob
const processBlob = async (blob) => {
  playback.src = URL.createObjectURL(blob);
  playback.load();
  analysisTag.textContent = 'Pendiente de análisis';
};

// Event bindings
recordBtn.addEventListener('click', startRecording);
stopBtn.addEventListener('click', stopRecording);
analyzeBtn.addEventListener('click', analyzeSpeech);
fileInput.addEventListener('change', async (event) => {
  const [file] = event.target.files;
  await handleFile(file);
});

// Accessibility: keyboard focus for file label
fileInput.addEventListener('focus', () => fileInput.parentElement.classList.add('focus'));
fileInput.addEventListener('blur', () => fileInput.parentElement.classList.remove('focus'));

// Prepare clean waveform background
canvasCtx.fillStyle = '#e2e8f0';
canvasCtx.fillRect(0, 0, canvas.width, canvas.height);
