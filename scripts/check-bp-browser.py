"""Chromium checks against the real TanStack + Convex dev site; no accounts/bookings."""
import argparse
import os
import signal
import subprocess
import time
from pathlib import Path
from urllib.error import URLError
from urllib.request import urlopen

from playwright.sync_api import expect, sync_playwright


def check():
    output = Path(os.environ.get("DELTA_SCRATCH_DIR", "test-results"))
    output.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(channel="chromium", headless=True)
        page = browser.new_page()
        page.emulate_media(reduced_motion="reduce")
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))

        def fill(systolic=118, diastolic=76, weight=72, unit="kg"):
            for field, value in [("systolic", systolic), ("diastolic", diastolic), ("weight", weight)]:
                page.locator(f"#bp-{field}").fill(str(value))
            page.locator("#bp-unit").select_option(unit)

        def generate(title, cards=3):
            page.locator("#bp-generate").click()
            expect(page.locator("#bp-results h3").first).to_have_text(title, timeout=20000)
            expect(page.locator(".bp-pose-card")).to_have_count(cards)

        for width, height in [(1440, 1000), (1024, 768), (768, 1024), (390, 844), (320, 740)]:
            page.set_viewport_size({"width": width, "height": height})
            page.goto(os.environ.get("BP_SITE_URL", "http://localhost:3000"))
            # Wait for hydration + the page's real anonymous bootstrap, not SSR HTML alone.
            expect(page.locator("#bp-form")).to_be_visible(timeout=30000)
            expect(page.locator("#bp-form")).to_be_visible()
            assert not page.get_by_text("Many ways to move.", exact=False).count()
            # Hero opens the Personalised Yoga Plan questionnaire (live pricing,
            # locked preview and demo payment); the BP tool remains at #programs.
            page.get_by_role("button", name="Create Your Personalized Yoga").click()
            expect(page.locator(".wellness-shell")).to_be_visible()
            expect(page.locator(".goal-option")).to_have_count(12)
            page.keyboard.press("Escape")
            expect(page.locator("dialog[open]")).to_have_count(0)
            expect(page.locator("#bp-generate")).to_be_disabled()
            fill(unit="")
            expect(page.locator("#bp-generate")).to_be_disabled()
            page.locator("#bp-unit").select_option("kg")
            page.locator("#bp-weight").fill("")
            expect(page.locator("#bp-generate")).to_be_disabled()
            page.locator("#bp-weight").fill("72")
            page.locator("#bp-systolic").fill("70")
            page.locator("#bp-systolic").blur()
            expect(page.locator("#bp-generate")).to_be_disabled()
            expect(page.locator("#bp-diastolic-error")).not_to_be_empty()
            fill()
            generate("Normal BP reference")
            expect(page.locator(".bp-pose-card ol li")).to_have_count(12)
            expect(page.locator(".bp-pose-safety")).to_have_count(3)
            expect(page.locator(".bp-diet")).to_be_visible()
            page.wait_for_function("() => [...document.querySelectorAll('.bp-pose-card img')].every(i => i.complete && i.naturalWidth)")
            positions = page.locator(".bp-pose-card").evaluate_all("(cards) => cards.map(c => ({x:c.offsetLeft,y:c.offsetTop}))")
            assert len({p["y"] for p in positions}) == 1 if width > 640 else len({p["x"] for p in positions}) == 1
            assert page.evaluate("document.documentElement.scrollWidth <= innerWidth"), width
            page.locator("#bp-results").screenshot(path=str(output / f"tanstack-bp-results-{width}.png"),
                style=".site-header,.chat-launcher,.environment-notice,.skip-link{visibility:hidden!important}")
            for systolic, diastolic, title in [
                (125, 78, "Elevated BP"), (135, 85, "High BP — Stage 1"),
                (150, 95, "High BP — Stage 2"), (150, 55, "High BP — Stage 2"),
                (88, 58, "Low BP reference"),
            ]:
                fill(systolic, diastolic)
                expect(page.locator(".bp-pose-card")).to_have_count(0)
                generate(title)
            page.locator('[name="symptoms"][value="dizziness"]').check()
            expect(page.locator("#bp-live-safety")).to_be_hidden()
            generate("Low BP reference", 0)
            expect(page.locator(".bp-pose-card")).to_have_count(3)
            page.locator('[value="dizziness"]').uncheck()
            for value in ["severe_breathlessness", "severe_headache", "blurred_vision"]:
                page.locator(f'[name="symptoms"][value="{value}"]').check()
                expect(page.locator("#bp-live-safety")).to_contain_text("Consult your doctor immediately")
                generate("Consult your doctor", 0)
                expect(page.locator(".bp-pose-card")).to_have_count(0)
                expect(page.locator(".bp-consult")).to_contain_text("Consult your doctor immediately")
                page.locator(f'[value="{value}"]').uncheck()
            for systolic, diastolic in [(185, 100), (125, 122)]:
                fill(systolic, diastolic)
                generate("Severe BP reading", 0)
                expect(page.locator("#bp-results")).to_contain_text("at least one minute")
                expect(page.locator(".bp-consult")).to_contain_text("Consult your doctor immediately")
            fill()
            page.locator('[value="chest_pain"]').check()
            expect(page.locator("#bp-live-safety")).to_be_hidden()
            generate("Normal BP reference", 0)
            expect(page.locator(".bp-pose-card")).to_have_count(3)
            page.locator('[value="chest_pain"]').uncheck()
            page.locator('[name="exerciseRestricted"]').check()
            generate("Follow your clinician’s exercise restriction", 0)
            page.locator('[name="exerciseRestricted"]').uncheck()
            fill(weight=158.7, unit="lb")
            page.locator("#bp-goal").select_option("gradual_weight_management")
            generate("Normal BP reference")
            expect(page.locator(".bp-weight-guidance")).to_contain_text("158.7 lb")
            expect(page.locator(".bp-weight-guidance")).to_contain_text("sustainable eating")
            page.locator('#bp-form button[type="reset"]').click()
            expect(page.locator(".bp-pose-card")).to_have_count(0)
            expect(page.locator("#bp-systolic")).to_have_value("")
            expect(page.locator("#bp-generate")).to_be_disabled()
            page.locator("#bp-form").screenshot(path=str(output / f"tanstack-bp-form-{width}.png"),
                style=".site-header,.chat-launcher,.environment-notice,.skip-link{visibility:hidden!important}")
            print(f"PASS real TanStack/Convex BP inputs, routes, safety and layout at {width}x{height}")

        page.route("**/images/poses/tadasana.svg", lambda route: route.abort())
        fill()
        generate("Normal BP reference")
        expect(page.locator(".bp-pose-card img").first).to_have_attribute("src", "/images/poses/fallback.svg")
        expect(page.locator(".bp-pose-card img").first).to_have_attribute("alt", "Illustration unavailable for Tadasana. Read the steps below with a qualified instructor.")
        page.unroute("**/images/poses/tadasana.svg")
        page.route("**/api/wellness/recommend", lambda route: route.abort())
        fill(150, 95)
        page.locator("#bp-generate").click()
        expect(page.locator("#bp-request-error")).to_contain_text("No plan has been generated")
        expect(page.locator(".bp-pose-card")).to_have_count(0)
        page.unroute("**/api/wellness/recommend")
        generate("High BP — Stage 2")
        # Hold an in-flight response, change safety inputs, then deliver the old plan.
        held = []
        def hold(route):
            response = route.fetch()
            held.append((route, response))
            page.evaluate("window.__bpHeld = true")
        page.route("**/api/wellness/recommend", hold)
        fill()
        page.locator("#bp-generate").click()
        expect(page.locator("#bp-generate")).to_be_disabled()
        page.wait_for_function("() => window.__bpHeld === true")
        page.locator('[name="symptoms"][value="blurred_vision"]').check()
        expect(page.locator("#bp-live-safety")).to_contain_text("Consult your doctor immediately")
        for route, response in held:
            route.fulfill(response=response)
        page.evaluate("async () => { await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame); }")
        expect(page.locator(".bp-pose-card")).to_have_count(0)
        page.unroute("**/api/wellness/recommend")
        page.reload()
        expect(page.locator("#bp-systolic")).to_have_value("")
        # TanStack can store navigation/scroll state; assert health data is absent.
        storage = page.evaluate("() => JSON.stringify([Object.entries(localStorage), Object.entries(sessionStorage)]).toLowerCase()")
        assert not any(key in storage for key in [
            "systolic", "diastolic", "weightunit", "chest_pain", "gradual_weight_management",
        ])
        expect(page.locator("#bp-form")).to_be_visible(timeout=30000)
        for width, height in [(1440, 1000), (390, 844)]:
            page.set_viewport_size({"width": width, "height": height})
            page.locator(".about-copy .button").click()
            expect(page.locator("dialog[open]")).to_be_visible()
            # Booking intentionally preserves its last step when reopened.
            expect(page.locator(".class-options, .calendar-grid")).to_be_visible()
            if page.locator(".class-option").count():
                page.locator(".class-option").first.click()
            expect(page.locator(".calendar-grid")).to_be_visible()
            page.keyboard.press("Escape")
            expect(page.locator("dialog[open]")).to_have_count(0)
            page.get_by_role("button", name="Open wellness assistant").click()
            expect(page.locator("#chat-panel")).to_be_visible()
            page.locator(".chat-options button").first.click()
            page.locator("#chat-main").click()
            page.locator("#chat-close").click()
            expect(page.locator("#chat-panel")).to_be_hidden()

        # Personalised Yoga Plan journey: pricing updates live, Generate plan
        # produces a locked/blurred preview, and the demo payment unlocks it.
        page.set_viewport_size({"width": 1440, "height": 1000})
        page.goto(os.environ.get("BP_SITE_URL", "http://localhost:3000"))
        expect(page.locator("#bp-form")).to_be_visible(timeout=30000)
        page.get_by_role("button", name="Create Your Personalized Yoga").click()
        expect(page.locator(".wellness-shell")).to_be_visible()
        # Empty selection is priced as the general-wellness fallback.
        expect(page.locator(".wellness-price-total span:last-child")).to_have_text("₹800")
        expect(page.locator(".order-total")).to_contain_text("₹800")
        # Two goals: ₹800 + ₹200, recalculated as selections change.
        page.locator(".goal-option input").nth(1).check()
        page.locator(".goal-option input").nth(3).check()
        expect(page.locator(".wellness-price-total span:last-child")).to_have_text("₹1,000")
        expect(page.locator(".order-total")).to_contain_text("₹1,000")
        page.locator("#wellness-name").fill("Shailja")
        page.locator("#wellness-email").fill("shailja@example.com")
        page.locator("#wellness-age").fill("30")
        page.get_by_role("button", name="Generate plan").click()
        # The paid plan is not rendered at all while locked: only the lock card
        # exists, so nothing can be scrolled up into view before paying.
        expect(page.locator(".plan-lock-overlay")).to_be_visible()
        expect(page.locator(".plan-day")).to_have_count(0)
        expect(page.locator(".plan-activity")).to_have_count(0)
        locked_overlay = page.locator(".plan-lock-overlay")
        expect(locked_overlay).to_be_visible()
        expect(locked_overlay).to_contain_text("Your personalised plan is ready")
        expect(locked_overlay).to_contain_text("₹1,000")
        page.get_by_role("button", name="Complete Payment and Generate").click()
        expect(page.locator(".plan-lock-overlay")).to_have_count(0)
        expect(page.locator(".demo-success")).to_have_text("Demo payment successful. Your plan is unlocked.")
        expect(page.locator(".plan-day")).to_have_count(7)
        expect(page.locator(".plan-activity .activity-image").first).to_be_visible()
        expect(page.get_by_role("button", name="Download PDF")).to_be_visible()
        expect(page.get_by_role("button", name="Download Word (.docx)")).to_be_visible()
        # Editing answers re-runs safety screening; a deferred plan is never purchasable.
        page.get_by_role("button", name="Generate another plan").click()
        page.locator("#wellness-age").fill("9")
        page.get_by_role("button", name="Generate plan").click()
        expect(page.locator(".wellness-notice.defer").first).to_be_visible()
        expect(page.get_by_role("button", name="Complete Payment and Generate")).to_have_count(0)
        expect(page.locator(".plan-lock-overlay")).to_have_count(0)
        page.keyboard.press("Escape")
        expect(page.locator("dialog[open]")).to_have_count(0)
        print("PASS personalised yoga pricing, locked preview, demo payment unlock and safety deferral")

        assert not errors, errors
        print("PASS fallback, retry, stale-response safety, reload/privacy, desktop/mobile booking/chat smoke and zero JS errors")
        browser.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--start-server", action="store_true")
    options = parser.parse_args()
    process = None
    log = None
    try:
        if options.start_server:
            log_path = Path(os.environ.get("DELTA_SCRATCH_DIR", "test-results")) / "tanstack-dev.log"
            log_path.parent.mkdir(parents=True, exist_ok=True)
            log = log_path.open("w")
            process = subprocess.Popen(["bun", "run", "dev", "--port", "3000"], stdout=log, stderr=log, start_new_session=True)
            deadline = time.monotonic() + 60
            while True:
                if process.poll() is not None:
                    raise RuntimeError(f"Dev server exited; inspect {log_path}")
                try:
                    with urlopen("http://localhost:3000", timeout=2) as response:
                        if response.status == 200:
                            break
                except (URLError, TimeoutError):
                    pass
                if time.monotonic() >= deadline:
                    raise RuntimeError(f"Dev server did not start; inspect {log_path}")
                time.sleep(0.5)
        check()
    finally:
        if process is not None and process.poll() is None:
            os.killpg(process.pid, signal.SIGTERM)
            try:
                process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                os.killpg(process.pid, signal.SIGKILL)
        if log:
            log.close()
