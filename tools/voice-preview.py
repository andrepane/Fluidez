"""Local static preview plus the real voice endpoint, no audio stored on disk."""
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import importlib.util
from pathlib import Path
import os
import sys

root = Path(__file__).resolve().parents[1]
os.chdir(root)
sys.path.insert(0, str(root))
spec = importlib.util.spec_from_file_location('voice_api', root/'api/voice-analysis.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
class Preview(SimpleHTTPRequestHandler):
    def do_POST(self):
        if self.path == '/api/voice-analysis':
            return module.handler.do_POST(self)
        self.send_error(404)
    send_json = module.handler.send_json
    def log_message(self, *args):
        pass
print('Voice preview: http://localhost:8765 (FLUIDEZ_VOICE_ENABLED=1 required)')
ThreadingHTTPServer(('127.0.0.1', 8765), Preview).serve_forever()
