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
