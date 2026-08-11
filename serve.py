#!/usr/bin/env python3
"""
Dev server for Verdant.

Two things `python -m http.server` does not do:

  1. SPA fallback. Every chapter is a real URL (/roots, /growth, ...) but there is
     only one document. Unknown paths without a file extension serve index.html,
     which is the same rewrite you would configure on Netlify, Cloudflare Pages,
     nginx or S3+CloudFront in production.
  2. No-cache. The shader bundle and tuning JSON are re-read constantly while
     art-directing; a 304 during a tuning session is maddening.

    python serve.py [port]
"""
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).parent


class Handler(SimpleHTTPRequestHandler):
    def send_head(self):
        path = self.path.split("?", 1)[0].split("#", 1)[0]
        target = ROOT / path.lstrip("/")
        if path != "/" and not target.exists() and "." not in Path(path).name:
            self.path = "/index.html"
        return super().send_head()

    def end_headers(self):
        self.send_header("Cache-Control", "no-store, must-revalidate")
        super().end_headers()

    def log_message(self, fmt, *args):
        if "304" not in (args[1] if len(args) > 1 else ""):
            sys.stderr.write("  %s\n" % (fmt % args))


def main() -> int:
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8931
    handler = partial(Handler, directory=str(ROOT))
    with ThreadingHTTPServer(("127.0.0.1", port), handler) as httpd:
        print(f"Verdant on http://localhost:{port}  (SPA fallback, no-cache)")
        print(f"  ?uil     tuning editor        ?stats   performance HUD")
        print(f"  ?tier=N  force quality 0-3    ?log     boot timing")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            pass
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
