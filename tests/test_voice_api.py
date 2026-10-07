import importlib.util
import io
import json
import os
import threading
import unittest
import urllib.request
import urllib.error
import wave
from http.server import ThreadingHTTPServer
import numpy as np

spec=importlib.util.spec_from_file_location('voice_api','api/voice-analysis.py')
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
class APITests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server=ThreadingHTTPServer(('127.0.0.1',0),module.handler)
        cls.thread=threading.Thread(target=cls.server.serve_forever,daemon=True);cls.thread.start()
        cls.url='http://127.0.0.1:%s/'%cls.server.server_port
    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown();cls.server.server_close();cls.thread.join()
    def setUp(self):
        self.old=os.environ.get('FLUIDEZ_VOICE_ENABLED');os.environ['FLUIDEZ_VOICE_ENABLED']='1';module._requests.clear()
    def tearDown(self):
        if self.old is None:os.environ.pop('FLUIDEZ_VOICE_ENABLED',None)
        else:os.environ['FLUIDEZ_VOICE_ENABLED']=self.old
    def request(self,data=b'x'*100,headers=None):
        req=urllib.request.Request(self.url,data=data,headers=headers or {'Content-Type':'audio/wav'})
        try:r=urllib.request.urlopen(req)
        except urllib.error.HTTPError as e:r=e
        with r:return r.status,json.load(r),r.headers
    def test_disabled_and_origin_gates(self):
        os.environ['FLUIDEZ_VOICE_ENABLED']='0';self.assertEqual(self.request()[0],503)
        os.environ['FLUIDEZ_VOICE_ENABLED']='1';self.assertEqual(self.request(headers={'Content-Type':'audio/wav','Origin':'https://wrong.example'})[0],403)
        self.assertEqual(self.request(headers={'Content-Type':'application/json'})[0],415)
    def test_real_pcm_request_and_no_store(self):
        output=io.BytesIO();t=np.arange(16000)/16000
        with wave.open(output,'wb') as f:
            f.setnchannels(1);f.setsampwidth(2);f.setframerate(16000);f.writeframes((.4*np.sin(2*np.pi*200*t)*32767).astype('<i2').tobytes())
        code,data,headers=self.request(output.getvalue())
        self.assertEqual(code,200);self.assertEqual(data['source'],'Praat/Parselmouth');self.assertEqual(headers['Cache-Control'],'no-store')
        self.assertLess(abs(np.median([p['hz'] for p in data['points'] if p['hz']])-200),1)
    def test_invalid_audio_and_rate_limit(self):
        for _ in range(5):self.assertEqual(self.request()[0],400)
        self.assertEqual(self.request()[0],429)
