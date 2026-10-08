import importlib.util,json,tempfile,unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('benchmark',ROOT/'scripts/benchmark-live-f0.py')
benchmark=importlib.util.module_from_spec(spec);spec.loader.exec_module(benchmark)
class LiveComparisonTests(unittest.TestCase):
    def test_same_audio_real_and_synthetic_regression(self):
        with tempfile.TemporaryDirectory() as directory:
            output=Path(directory)/'result.json';benchmark.run(output)
            rows={r['audio']:r for r in json.loads(output.read_text())}
        for name in ['male','female','male-quiet','female-quiet']:
            row=rows[name]
            self.assertGreater(row['after']['coverage'],row['before']['coverage']+.2)
            self.assertLess(row['after']['p90Cents'],50)
            self.assertEqual(row['after']['octaveDisagreements'],0)
            self.assertLessEqual(row['after']['unvoicedAccepted'],1)
        for name in ['silence','noise-only']:
            self.assertEqual(rows[name]['after']['unvoicedAccepted'],0)
            self.assertEqual(rows[name]['diagnostic']['accepted'],0)
        for name in ['stable','rise','fall','harmonic','short-syllables']:
            self.assertLess(rows[name]['after']['p90Cents'],25)
        self.assertEqual(rows['harmonic']['after']['octaveDisagreements'],0)
