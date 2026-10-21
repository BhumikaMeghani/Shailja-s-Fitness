"""Exercise the built website + real Convex HTTP client against an old-backend fixture.

Run after npm run build: python3 scripts/check-bootstrap-compatibility.py
Uses only local processes and test credentials; never contacts a live deployment.
Requires Python Playwright and Chromium. Browser API requests are NOT intercepted.
"""
import json
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import subprocess
from threading import Thread
import time
from urllib.error import URLError
from urllib.request import urlopen

from playwright.sync_api import expect, sync_playwright

KEY = "test-only-server-key-not-for-production-123456"
calls = []
mode = "missing"


class Backend(BaseHTTPRequestHandler):
    def log_message(self, *_):
        pass

    def do_POST(self):
        payload = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        path = payload["path"]
        calls.append(path)
        args = payload["args"]
        # Convex protocol versions may encode args as a one-element array.
        if isinstance(args, list):
            args = args[0]
        assert args["server_key"] == KEY
        if mode == "outage":
            self.send_error(503)
            return
        if path == "studio:getSessionContext":
            body = {
                "status": "error", "logLines": [],
                "errorMessage": "Could not find public function for 'studio:getSessionContext'. "
                                "Did you forget to run `npx convex dev` or `npx convex deploy`?",
            }
        elif path == "studio:getSession":
            body = {"status": "success", "value": {
                "token_hash": args["token_hash"], "user_id": "fixture-user",
                "csrf": "fixture-csrf", "expires": int(time.time()) + 86400,
            }}
        elif path == "studio:getUser":
            body = {"status": "success", "value": {
                "id": "fixture-user", "email": "fixture@example.com", "password_hash": "private-fixture",
            }}
        else:
            raise AssertionError(f"Unexpected backend call: {path}")
        data = json.dumps(body).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)


if __name__ == "__main__":
    root = Path(__file__).resolve().parent.parent
    output = Path(os.environ.get("DELTA_SCRATCH_DIR", "test-results"))
    output.mkdir(parents=True, exist_ok=True)
    backend = ThreadingHTTPServer(("127.0.0.1", 0), Backend)
    Thread(target=backend.serve_forever, daemon=True).start()
    url = "http://127.0.0.1:3128"
    with (output / "bootstrap-compatibility.log").open("w") as log:
        server = subprocess.Popen(["node", ".output/server/index.mjs"], cwd=root,
                                  env={**os.environ, "HOST": "127.0.0.1", "PORT": "3128",
                                       "CONVEX_URL": f"http://127.0.0.1:{backend.server_port}",
                                       "CONVEX_SERVER_KEY": KEY, "APP_ENV": "development",
                                       "SMTP_USER": "", "SMTP_APP_PASSWORD": ""},
                                  stdout=log, stderr=log)
        try:
            for _ in range(100):
                if server.poll() is not None:
                    raise RuntimeError("Website exited; see bootstrap-compatibility.log")
                try:
                    urlopen(url, timeout=2).close()
                    break
                except (URLError, TimeoutError):
                    time.sleep(0.1)
            else:
                raise RuntimeError("Website did not start")
            with sync_playwright() as p:
                browser = p.chromium.launch()
                context = browser.new_context(viewport={"width": 1440, "height": 1000})
                context.add_cookies([{"name": "studio_session", "value": "fixture-token", "url": url}])
                page = context.new_page()
                with page.expect_response(lambda r: r.url.endswith("/api/bootstrap")) as loaded:
                    page.goto(url + "/programs")
                assert loaded.value.status == 200
                data = loaded.value.json()
                assert data["user"] == {"email": "fixture@example.com"}
                assert "password_hash" not in json.dumps(data)
                assert calls == ["studio:getSessionContext", "studio:getSession", "studio:getUser"], calls
                page.get_by_label("Normal Yoga plan details", exact=True).press("Enter")
                page.get_by_role("button", name="Book An Appointment", exact=True).first.click()
                expect(page.locator("dialog[open] .class-option")).to_have_count(3)
                expect(page.locator("dialog[open] .booking-error")).to_be_empty()
                page.screenshot(path=str(output / "booking-compatible-backend.png"))
                # Genuine backend failures still return 503, without extra queries.
                calls.clear()
                mode = "outage"
                response = context.request.get(url + "/api/bootstrap")
                assert response.status == 503
                assert calls == ["studio:getSessionContext"], calls
                browser.close()
            print("Old-backend bootstrap and booking dialog passed through the real HTTP client.")
            print("Backend outage still fails closed with HTTP 503 and no fallback reads.")
        finally:
            server.terminate()
            server.wait(timeout=10)
            backend.shutdown()
            backend.server_close()
