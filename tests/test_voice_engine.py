import io
import wave
import unittest
import numpy as np
from voice_engine import analyze_wav

def wav(values, rate=16000):
    output=io.BytesIO()
    with wave.open(output,'wb') as f:
        f.setnchannels(1);f.setsampwidth(2);f.setframerate(rate)
        f.writeframes((np.clip(values,-1,1)*32767).astype('<i2').tobytes())
    return output.getvalue()

class VoiceTests(unittest.TestCase):
    def test_harmonic_voice_reference(self):
        for hz in (100,200,400,700):
            t=np.arange(16000)/16000
            signal=.3*np.sin(2*np.pi*hz*t)+.1*np.sin(4*np.pi*hz*t)
            result=analyze_wav(wav(signal),75,1200)
            values=[p['hz'] for p in result['points'] if p['hz']]
            self.assertGreater(len(values),80)
            self.assertLess(abs(np.median(values)-hz),1)
            self.assertEqual(result['praatVersion'],'6.1.38')
    def test_silence_remains_unvoiced(self):
        result=analyze_wav(wav(np.zeros(16000)))
        self.assertTrue(all(p['hz'] is None for p in result['points']))
    def test_pause_creates_gap(self):
        t=np.arange(16000)/16000
        result=analyze_wav(wav(np.concatenate([.4*np.sin(2*np.pi*200*t),np.zeros(16000),.4*np.sin(2*np.pi*300*t)])))
        self.assertTrue(all(p['hz'] is None for p in result['points'] if 1.2<p['time']<1.8))
    def test_reject_bad_format_limits_duration(self):
        for raw,low,high in [(b'garbage',75,600),(wav(np.zeros(16000)),float('nan'),600),(wav(np.zeros(16000),8000),75,600),(wav(np.zeros(121*16000)),75,600),(wav(np.zeros(16000))[:-100],75,600)]:
            with self.assertRaises(ValueError):analyze_wav(raw,low,high)

    def test_quiet_voice_and_glide_preserve_known_frequency(self):
        t=np.arange(32000)/16000
        quiet=analyze_wav(wav(.006*np.sin(2*np.pi*200*t)))
        self.assertLess(abs(np.median([p['hz'] for p in quiet['points'] if p['hz']])-200),1)
        phase=2*np.pi*(120*t+32.5*t*t)
        glide=analyze_wav(wav(.3*np.sin(phase)))
        errors=[abs(p['hz']-(120+65*p['time'])) for p in glide['points'] if p['hz']]
        self.assertLess(np.median(errors),1)
        self.assertTrue(all(0<=p['periodicity']<=1 for p in glide['points']))
        self.assertEqual(glide['signal']['clippedFraction'],0)

    def test_descending_and_multiple_changes(self):
        t=np.arange(32000)/16000
        result=analyze_wav(wav(.3*np.sin(2*np.pi*(280*t-35*t*t))))
        self.assertLess(np.median([abs(p['hz']-(280-70*p['time'])) for p in result['points'] if p['hz']]),1)
        values=np.concatenate([.3*np.sin(2*np.pi*hz*np.arange(8000)/16000) for hz in (150,220,180,300)])
        result=analyze_wav(wav(values))
        for i,hz in enumerate((150,220,180,300)):
            found=[p['hz'] for p in result['points'] if i*.5+.1<p['time']<(i+1)*.5-.1 and p['hz']]
            self.assertLess(abs(np.median(found)-hz),1)
    def test_public_human_voice_file(self):
        import base64
        from pathlib import Path
        raw=base64.b64decode((Path(__file__).parent/'fixtures/public-speech.wav.b64').read_text())
        result=analyze_wav(raw)
        self.assertTrue(any(p['hz'] is not None for p in result['points']))
        self.assertTrue(any(p['hz'] is None for p in result['points']))
        self.assertTrue(all(0<=p['time']<=result['duration'] for p in result['points']))
    def test_long_recording_bounded(self):
        import time
        t=np.arange(119*16000)/16000
        signal=.3*np.sin(2*np.pi*200*t);signal[(t%5)>4]=0
        start=time.perf_counter();result=analyze_wav(wav(signal));elapsed=time.perf_counter()-start
        self.assertLess(len(result['points']),12000)
        self.assertTrue(all(p['hz'] is None for p in result['points'] if 4.2<p['time']%5<4.8))
        print(f'119-second Praat test: {elapsed:.3f} seconds; {len(result["points"])} windows')
