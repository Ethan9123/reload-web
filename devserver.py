# Tiny no-cache static server for local dev (so edits show up without stale caching).
# Usage: python devserver.py   ->  http://localhost:8765
import http.server, functools, os

DIR = os.path.dirname(os.path.abspath(__file__))
PORT = 8765


class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Expires", "0")
        super().end_headers()


# ThreadingHTTPServer (like `python -m http.server`) so parallel browser fetches don't block.
http.server.ThreadingHTTPServer.allow_reuse_address = True
httpd = http.server.ThreadingHTTPServer(("", PORT), functools.partial(Handler, directory=DIR))
print(f"RELOAD dev server (no-cache, threaded) serving {DIR} on http://localhost:{PORT}")
httpd.serve_forever()
