"""Vercel Python function. Enable explicitly with FLUIDEZ_VOICE_ENABLED=1."""
from http.server import BaseHTTPRequestHandler
import json
import os
import time
import threading
from urllib.parse import urlsplit
from voice_engine import analyze_wav, MAX_BYTES

_lock = threading.Lock()
_requests = {}
_slots = threading.BoundedSemaphore(2)

class handler(BaseHTTPRequestHandler):
    def send_json(self, code, data):
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.end_headers()
        self.wfile.write(json.dumps(data, allow_nan=False).encode())

    def do_GET(self):
        self.send_json(405, {'error': 'POST required'})

    def do_POST(self):
        if os.environ.get('FLUIDEZ_VOICE_ENABLED') != '1':
            return self.send_json(503, {'error': 'Voice analysis not enabled'})
        origin = self.headers.get('Origin')
        if origin and urlsplit(origin).netloc != self.headers.get('Host'):
            return self.send_json(403, {'error': 'Origin not allowed'})
        if self.headers.get('Content-Type', '').split(';')[0] != 'audio/wav':
            return self.send_json(415, {'error': 'WAV required'})
        try:
            length = int(self.headers.get('Content-Length', '0'))
            floor = float(self.headers.get('X-Pitch-Floor', '75'))
            ceiling = float(self.headers.get('X-Pitch-Ceiling', '600'))
        except ValueError:
            return self.send_json(400, {'error': 'Invalid request'})
        if not 44 < length <= MAX_BYTES:
            return self.send_json(413, {'error': 'Audio size limit'})
        ip = self.headers.get('X-Forwarded-For', self.client_address[0]).split(',')[0].strip()
        now = time.monotonic()
        with _lock:
            for key in list(_requests):
                if now - _requests[key][0] >= 60:
                    del _requests[key]
            window, count = _requests.get(ip, (now, 0))
            if count >= 5 or len(_requests) >= 1000:
                return self.send_json(429, {'error': 'Please retry later'})
            _requests[ip] = (window, count+1)
        if not _slots.acquire(blocking=False):
            return self.send_json(429, {'error': 'Server busy'})
        try:
            result = analyze_wav(self.rfile.read(length), floor, ceiling)
            self.send_json(200, result)
        except ValueError:
            self.send_json(400, {'error': 'Invalid audio or pitch limits'})
        except Exception:
            self.send_json(500, {'error': 'Analysis unavailable'})
        finally:
            _slots.release()

    def log_message(self, *args):
        pass  # Do not log audio, transcripts or request headers.
