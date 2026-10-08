"""Same-PCM comparison: audited PR32 vs 30 ms and adaptive/recovery ablations."""
import importlib.util,json,subprocess,sys,tempfile
from pathlib import Path
import numpy as np
import parselmouth
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('bank',ROOT/'scripts/benchmark-live-f0.py')
bank=importlib.util.module_from_spec(spec);spec.loader.exec_module(bank)

def make_bank(directory):
    directory=Path(directory);bank.make_bank(directory)
    rate=48000;t=np.arange(rate*4)/rate;rng=np.random.default_rng(302)
    def add(name,x,regions=None,restarts=None,unvoiced=None):
        x=np.asarray(x,dtype=np.float32);x.tofile(directory/(name+'.f32'))
        sound=parselmouth.Sound(x,sampling_frequency=rate).resample(16000)
        result=bank.analyze_wav(bank.wav(sound.values[0]),75,600)
        (directory/(name+'.json')).write_text(json.dumps({'rate':rate,'duration':len(x)/rate,'points':result['points'],'knownVoiceRegions':regions or [],'restarts':restarts or [],'knownNonperiodicRegions':unvoiced or []}))
    region=[{'begin':.1,'end':3.9,'hz':180}]
    add('weak-periodic',.00015*np.sin(2*np.pi*180*t),region)
    x=rng.normal(0,.00001,len(t));x[t>=.5]+=.0002*np.sin(2*np.pi*180*t[t>=.5]);add('weak-background',x,[{'begin':.55,'end':3.9,'hz':180}],unvoiced=[{'begin':.1,'end':.4}])
    add('weak-noise-only',rng.normal(0,.00012,len(t)),unvoiced=[{'begin':.1,'end':3.9}])
    add('fan-50hz',.001*np.sin(2*np.pi*50*t)+rng.normal(0,.00001,len(t)),unvoiced=[{'begin':.1,'end':3.9}])
    x=np.zeros(len(t))
    for at in [.5,1.5,2.5]:
        ix=(t>=at)&(t<at+.01);x[ix]=.2*np.exp(-(t[ix]-at)*500)
    add('knocks',x,unvoiced=[{'begin':.1,'end':3.9}])
    x=.05*np.sin(2*np.pi*180*t);gap=(t>=1)&(t<1.06);x[gap]=rng.normal(0,.03,sum(gap));add('brief-periodicity-break',x,[{'begin':.1,'end':.95,'hz':180},{'begin':1.11,'end':3.9,'hz':180}],restarts=[1.06])
    amplitude=np.where((t>=1)&(t<1.3),.00015,.05);add('intensity-drop',amplitude*np.sin(2*np.pi*180*t),region)
    x=np.where(t<1,.05*np.sin(2*np.pi*180*t),.05*np.sin(2*np.pi*360*t));gap=(t>=1)&(t<1.06);x[gap]=rng.normal(0,.03,sum(gap));add('break-then-octave',x,[{'begin':.1,'end':.95,'hz':180},{'begin':1.11,'end':3.9,'hz':360}],restarts=[1.06])

def run(output):
    with tempfile.TemporaryDirectory() as directory:
        make_bank(directory)
        subprocess.run(['node',str(ROOT/'scripts/benchmark-pitch5-update.mjs'),directory,str(output)],check=True)
if __name__=='__main__':run(Path(sys.argv[1]).resolve() if len(sys.argv)>1 else Path('/tmp/pitch5-update.json'))
