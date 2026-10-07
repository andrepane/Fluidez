"""Bounded, memory-only WAV to Praat pitch analysis. No clinical interpretation."""
import io
import wave
import numpy as np
import parselmouth

MAX_SECONDS = 120
MAX_BYTES = 4_000_000

def analyze_wav(raw, floor=75., ceiling=600.):
    if not (50 <= floor <= 300 and 150 <= ceiling <= 1200 and ceiling >= floor * 2):
        raise ValueError('Invalid pitch limits')
    if not raw or len(raw) > MAX_BYTES:
        raise ValueError('Invalid audio size')
    try:
        with wave.open(io.BytesIO(raw), 'rb') as audio:
            rate, channels, width, frames = audio.getframerate(), audio.getnchannels(), audio.getsampwidth(), audio.getnframes()
            if channels != 1 or width != 2 or rate != 16000 or audio.getcomptype() != 'NONE' or not (0.1 <= frames/rate <= MAX_SECONDS):
                raise ValueError('Expected mono PCM16 16 kHz WAV, 0.1–120 seconds')
            pcm = audio.readframes(frames)
            if len(pcm) != frames * 2:
                raise ValueError('Truncated audio')
    except (wave.Error, EOFError) as exc:
        raise ValueError('Invalid WAV') from exc
    values = np.frombuffer(pcm, dtype='<i2').astype(np.float64) / 32768.
    sound = parselmouth.Sound(values, sampling_frequency=rate)
    pitch = sound.to_pitch_ac(time_step=.01, pitch_floor=floor, pitch_ceiling=ceiling,
                              very_accurate=True, silence_threshold=.03, voicing_threshold=.45)
    frequencies = pitch.selected_array['frequency']
    strengths = pitch.selected_array['strength']
    points = [{'time': float(t), 'hz': float(f) if f > 0 and np.isfinite(f) else None,
               'periodicity': max(0., min(1., float(strength)))}
              for t, f, strength in zip(pitch.xs(), frequencies, strengths)]
    return {'source': 'Praat/Parselmouth', 'version': parselmouth.VERSION,
            'praatVersion': parselmouth.PRAAT_VERSION, 'method': 'raw autocorrelation',
            'duration': frames/rate, 'floor': floor, 'ceiling': ceiling, 'points': points,
            'signal': {'clippedFraction': float(np.mean(np.abs(values) >= .99))}}
