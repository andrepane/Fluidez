"""Reproduce A/B on identical public/synthetic PCM against Praat references."""
import importlib.util,subprocess,tempfile,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('bank',ROOT/'scripts/benchmark-live-f0.py')
bank=importlib.util.module_from_spec(spec);spec.loader.exec_module(bank)
with tempfile.TemporaryDirectory() as directory:
    bank.make_bank(directory)
    subprocess.run(['node',str(ROOT/'scripts/benchmark-yin-ab.mjs'),directory,str(Path(sys.argv[1]).resolve())],check=True)
