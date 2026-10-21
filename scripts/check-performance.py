"""Check the production build in Chromium, using explicit API fixtures.

Run after npm run build: python3 scripts/check-performance.py
Requires Python Playwright and its Chromium browser. No live database is used
here; npm test covers the real route handlers backed by convex-test.
"""
import argparse
import json
import os
from pathlib import Path
import subprocess
import time
from urllib.error import URLError
from urllib.request import urlopen
from zipfile import ZipFile

from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parent.parent
BOOTSTRAP = {
    "csrf": "browser-fixture", "user": {"email": "fixture@example.com"},
    "today": "2026-10-21", "timezone": "Asia/Kolkata", "development": True,
    "payments_configured": False, "contact": {"email": "", "phone": "", "address": ""},
    "services": [{"id": "online", "name": "Online Live Class", "description": "Online yoga",
                  "icon": "video", "price_paise": None, "duration_days": 30, "currency": "INR"}],
}


def check(baseline, output, url):
    metrics = {}
    with sync_playwright() as p:
        browser = p.chromium.launch()
        for width in [390, 1440]:
            for path in ["/", "/about", "/programs", "/wall-of-art"]:
                context = browser.new_context(viewport={"width": width, "height": 1000},
                                              device_scale_factor=2, reduced_motion="reduce")
                context.route("**/api/bootstrap", lambda route: route.fulfill(json=BOOTSTRAP))
                page = context.new_page()
                errors = []
                page.on("pageerror", lambda error: errors.append(str(error)))
                page.goto(url + path)
                page.wait_for_load_state("networkidle")
                # Scroll through lazy-loaded cards and arm reveal animations.
                for y in range(0, page.locator("body").evaluate("(e) => e.scrollHeight"), 600):
                    page.evaluate("(y) => scrollTo(0, y)", y)
                    page.wait_for_timeout(80)
                page.wait_for_load_state("networkidle")
                page.wait_for_function("""() => [...document.querySelectorAll('main img')]
                  .every(i => i.complete && i.naturalWidth > 0)""")
                assert page.evaluate("document.documentElement.scrollWidth <= innerWidth"), (path, width)
                assert not errors, errors
                sources = page.locator("main img").evaluate_all("(images) => images.map(i => i.currentSrc)")
                if not baseline:
                    assert sources and all("/optimized/" in src for src in sources), sources
                resources = page.evaluate("""() => performance.getEntriesByType('resource').map(r =>
                  ({name:r.name, type:r.initiatorType, bytes:r.decodedBodySize}))""")
                metrics[f"{path}@{width}"] = {
                    # React preloads eager assets with initiatorType="link".
                    "javascriptBytes": sum(r["bytes"] for r in resources if r["name"].endswith(".js")),
                    "imageBytes": sum(r["bytes"] for r in resources
                                      if r["name"].endswith((".png", ".jpg", ".jpeg", ".webp", ".svg"))),
                    "imageSources": sources,
                }
                page.evaluate("scrollTo(0, 0)")
                page.screenshot(path=str(output / f"{'before' if baseline else 'after'}-{path.strip('/') or 'home'}-{width}.png"),
                                full_page=True)
                if path == "/" and not baseline:
                    # Document libraries must not load during initial navigation.
                    assert not any("downloadPlan" in r["name"] for r in resources)
                    page.get_by_role("button", name="Create Your Personalized Yoga").click()
                    page.get_by_label("Your name", exact=True).fill("Browser fixture")
                    page.get_by_label("Email address", exact=True).fill("fixture@example.com")
                    page.get_by_label("Age", exact=True).fill("30")
                    page.get_by_role("button", name="Generate plan", exact=False).click()
                    page.get_by_role("button", name="Complete Payment and Generate", exact=False).click()
                    expect(page.locator(".plan-day")).to_have_count(7)
                    thumbnails = page.locator(".activity-image")
                    thumbnails.first.scroll_into_view_if_needed()
                    page.wait_for_function("""() => {
                      const i = document.querySelector('.activity-image');
                      return i.complete && i.naturalWidth > 0 && i.currentSrc.includes('/optimized/')
                    }""")
                    if width == 1440:
                        # Downloads must retain photos when derivatives are missing.
                        context.route("**/optimized/yoga-poses/**", lambda route: route.fulfill(status=404))
                    for label, signature in [("Download PDF", b"%PDF"), ("Download Word (.docx)", b"PK")]:
                        with page.expect_download(timeout=60000) as download:
                            page.get_by_role("button", name=label, exact=True).click()
                        file = download.value
                        destination = output / file.suggested_filename
                        file.save_as(destination)
                        assert destination.read_bytes().startswith(signature)
                        if signature == b"PK":
                            with ZipFile(destination) as document:
                                assert any(name.startswith("word/media/") and name.endswith(".jpg")
                                           for name in document.namelist()), "Word export lost its photos"
                        else:
                            assert b"/Subtype /Image" in destination.read_bytes(), "PDF export lost its photos"
                    assert not errors, errors
                context.close()
        if not baseline:
            # A missing derivative must fall back to the original photograph.
            context = browser.new_context(viewport={"width": 1440, "height": 1000})
            context.route("**/api/bootstrap", lambda route: route.fulfill(json=BOOTSTRAP))
            context.route("**/optimized/**", lambda route: route.fulfill(status=404))
            page = context.new_page()
            page.goto(url)
            page.wait_for_function("""() => {
              const i = document.querySelector('.hero-bg');
              return i.complete && i.naturalWidth > 0 && i.currentSrc.endsWith('/images/hero-om.jpg')
            }""")
            context.close()
            request = browser.new_context().request
            manifest = json.loads((ROOT / "src/lib/image-manifest.json").read_text())
            image = next(iter(manifest.values()))["variants"][0]["src"]
            response = request.get(url + image)
            assert response.ok
            assert "immutable" in response.headers.get("cache-control", "")
            response = request.get(url + "/api/availability?service=invalid&date=bad")
            assert response.status == 400
            assert response.headers.get("cache-control") == "no-store"
        browser.close()
    label = "before" if baseline else "after"
    (output / f"metrics-{label}.json").write_text(json.dumps(metrics, indent=2))
    print(json.dumps({key: {k: v for k, v in value.items() if k != "imageSources"}
                      for key, value in metrics.items()}, indent=2))
    print("Browser checks passed (API fixtures; no live database).")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--baseline", action="store_true")
    parser.add_argument("--port", type=int, default=3127)
    args = parser.parse_args()
    output = Path(os.environ.get("DELTA_SCRATCH_DIR", "test-results")) / "performance"
    output.mkdir(parents=True, exist_ok=True)
    url = f"http://127.0.0.1:{args.port}"
    with (output / "server.log").open("w") as log:
        server = subprocess.Popen(["node", ".output/server/index.mjs"], cwd=ROOT,
                                  env={**os.environ, "PORT": str(args.port), "HOST": "127.0.0.1",
                                       "SMTP_USER": "", "SMTP_APP_PASSWORD": ""},
                                  stdout=log, stderr=log)
        try:
            for _ in range(100):
                if server.poll() is not None:
                    raise RuntimeError("Production server exited; see server.log")
                try:
                    urlopen(url, timeout=2).close()
                    break
                except (URLError, TimeoutError):
                    time.sleep(0.1)
            else:
                raise RuntimeError("Production server did not start")
            check(args.baseline, output, url)
        finally:
            server.terminate()
            server.wait(timeout=10)
