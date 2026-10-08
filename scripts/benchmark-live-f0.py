"""Reproducible causal baseline/new/Praat comparison, no network or patient audio."""
import base64,io,json,subprocess,sys,tempfile,wave,zlib
from pathlib import Path
import numpy as np
import parselmouth
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from voice_engine import analyze_wav

def wav(x):
    output=io.BytesIO()
    with wave.open(output,'wb') as f:
        f.setnchannels(1);f.setsampwidth(2);f.setframerate(16000)
        f.writeframes((np.clip(x,-1,1)*32767).astype('<i2').tobytes())
    return output.getvalue()

def make_bank(directory):
    directory=Path(directory)
    def add(name,x,rate=48000):
        x=np.asarray(x,dtype=np.float32);x.tofile(directory/(name+'.f32'))
        sound=parselmouth.Sound(x,sampling_frequency=rate).resample(16000)
        raw=wav(sound.values[0]);result=analyze_wav(raw,75,600)
        (directory/(name+'.json')).write_text(json.dumps({'rate':rate,'duration':len(x)/rate,'points':result['points']}))
    for name in ['male','female']:
        raw=zlib.decompress(base64.b64decode((ROOT/'tests/fixtures'/('reading-'+name+'.wav.zlib.b64')).read_text()))
        with wave.open(io.BytesIO(raw),'rb') as f:
            x=np.frombuffer(f.readframes(f.getnframes()),dtype='<i2').astype(float)/32768
        x=parselmouth.Sound(x,sampling_frequency=16000).resample(48000).values[0]
        add(name,x);add(name+'-quiet',x*.02)
    rng=np.random.default_rng(173);t=np.arange(4*48000)/48000
    for name,f in [('stable',np.full(len(t),180)),('rise',120+45*t),('fall',300-45*t),('rapid',180+55*np.sin(2*np.pi*2*t))]:
        phase=2*np.pi*np.cumsum(f)/48000;add(name,.1*np.sin(phase)+.04*np.sin(2*phase))
    for name,amplitude in [('quiet-tone',.004),('very-quiet-tone',.001)]:
        add(name,amplitude*np.sin(2*np.pi*180*t))
    base=.1*np.sin(2*np.pi*180*t)
    for snr in [20,10,0]:
        noise=rng.normal(size=len(t));noise*=np.sqrt(np.mean(base**2)/np.mean(noise**2))*10**(-snr/20)
        add('noise-'+str(snr),base+noise)
    add('noise-only',rng.normal(0,.003,len(t)));add('silence',np.zeros(len(t)))
    x=base.copy();x[(t%1)>.6]=0;add('pauses',x)
    x=base.copy();x[(t%.2)>.1]=0;add('short-syllables',x)
    add('harmonic',.1*np.sin(2*np.pi*150*t)+.5*np.sin(2*np.pi*450*t))
    x=base.copy();x*=.1+.9*np.maximum(0,np.sin(2*np.pi*t));add('intensity',x)

def run(output):
    with tempfile.TemporaryDirectory() as directory:
        make_bank(directory)
        subprocess.run(['node',str(ROOT/'scripts/benchmark-live-f0.mjs'),directory,str(output)],check=True)
if __name__=='__main__' and len(sys.argv)>1 and sys.argv[1]=='--sweep':
    with tempfile.TemporaryDirectory() as directory:
        make_bank(directory)
        subprocess.run(['node',str(ROOT/'scripts/sweep-live-f0.mjs'),directory,str(Path(sys.argv[2]).resolve())],check=True)
elif __name__=='__main__':
    run(Path(sys.argv[1]).resolve() if len(sys.argv)>1 else Path('live-f0-results.json').resolve())
