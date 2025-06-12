let recognition;
let startTime;
let totalWords = 0;
let mediaRecorder;
let audioChunks = [];

function updateStatus(wordsPerMinute) {
    const result = document.getElementById('wpmResult');
    const [min, max] = document.getElementById('wpmRange').value
        .split('-')
        .map(Number);
    let status = 'Normal';
    let color = 'green';

    if (wordsPerMinute < min) {
        status = 'Demasiado lento';
        color = 'red';
    } else if (wordsPerMinute > max) {
        status = 'Demasiado r\xC3\xA1pido';
        color = 'red';
    }

    result.style.color = color;
    result.textContent = `Velocidad: ${wordsPerMinute} palabras/min - ${status}`;
}

if ('webkitSpeechRecognition' in window) {
    recognition = new webkitSpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = 'es-ES';

    recognition.onstart = () => {
        document.getElementById('transcription').textContent = 'Escuchando...';
        startTime = new Date();
        totalWords = 0;
        document.getElementById('wpmResult').textContent = '-';
    };

    recognition.onresult = event => {
        let transcript = '';
        for (let i = 0; i < event.results.length; i++) {
            transcript += event.results[i][0].transcript + ' ';
        }
        transcript = transcript.trim();
        document.getElementById('transcription').textContent = transcript;
        totalWords = transcript.split(/\s+/).filter(Boolean).length;

        const now = new Date();
        const timeDiff = (now - startTime) / 60000;
        if (timeDiff > 0) {
            const wpm = Math.round(totalWords / timeDiff);
            updateStatus(wpm);
        }
    };

    recognition.onend = () => {
        const now = new Date();
        const timeDiff = (now - startTime) / 60000;
        if (timeDiff > 0) {
            const wpm = Math.round(totalWords / timeDiff);
            updateStatus(wpm);
        }
    };
}

document.getElementById('startRecord').addEventListener('click', async () => {
    recognition.start();
    document.getElementById('startRecord').disabled = true;
    document.getElementById('stopRecord').disabled = false;

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(stream);
    audioChunks = [];

    mediaRecorder.ondataavailable = e => {
        audioChunks.push(e.data);
    };

    mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunks, { type: 'audio/wav' });
        const audioUrl = URL.createObjectURL(audioBlob);
        const audioElement = document.createElement('audio');
        audioElement.controls = true;
        audioElement.src = audioUrl;

        const container = document.getElementById('audioContainer');
        container.innerHTML = '';
        container.appendChild(audioElement);

        document.getElementById('saveRecording').disabled = false;
        document.getElementById('saveRecording').onclick = () => {
            const a = document.createElement('a');
            a.href = audioUrl;
            a.download = (document.getElementById('filename').value || 'grabacion') + '.wav';
            a.click();
        };
    };

    mediaRecorder.start();
});

document.getElementById('stopRecord').addEventListener('click', () => {
    recognition.stop();
    mediaRecorder.stop();
    document.getElementById('startRecord').disabled = false;
    document.getElementById('stopRecord').disabled = true;
});
