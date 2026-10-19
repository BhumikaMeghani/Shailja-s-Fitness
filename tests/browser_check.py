"""Real Chromium smoke checks. Runs its own isolated server and database."""
import os
import sqlite3
import tempfile
import threading
from contextlib import closing
from pathlib import Path
from unittest.mock import patch

from playwright.sync_api import sync_playwright
from werkzeug.serving import make_server

from app import create_app


def main():
    blank_prices = {f"{service}_{field}": "" for service in ("ONLINE", "STUDIO", "PRIVATE")
                    for field in ("TEST_PRICE_PAISE", "DURATION_MINUTES", "TEST_TAX_PAISE")}
    with tempfile.TemporaryDirectory() as temporary, patch.dict(os.environ, blank_prices):
        app = create_app({"DATABASE": str(Path(temporary) / "browser.sqlite3"), "TESTING": True,
                          "APP_ENV": "development", "DEVELOPMENT_AVAILABILITY": True,
                          "RAZORPAY_KEY_ID": "", "RAZORPAY_KEY_SECRET": "", "RAZORPAY_WEBHOOK_SECRET": ""})
        server = make_server("127.0.0.1", 5055, app, threaded=True)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            with sync_playwright() as playwright:
                # Full Chromium channel avoids depending on a second headless-shell download.
                browser = playwright.chromium.launch(channel="chromium", headless=True)
                page = browser.new_page()
                errors = []
                page.on("pageerror", lambda error: errors.append(str(error)))
                screenshot_dir = Path(os.getenv("DELTA_SCRATCH_DIR", "test-results"))
                screenshot_dir.mkdir(parents=True, exist_ok=True)
                for width, height in [(1440, 1000), (1024, 768), (768, 1024), (390, 844), (320, 740)]:
                    page.set_viewport_size({"width": width, "height": height})
                    page.goto("http://127.0.0.1:5055")
                    page.wait_for_function("() => Boolean(window.Studio?.data?.csrf)")
                    page.locator(".hero-image").wait_for()
                    page.evaluate("document.querySelectorAll('img').forEach(i => i.loading='eager')")
                    page.wait_for_function("() => Array.from(document.images).every(i => i.complete && i.naturalWidth > 0)")
                    assert page.evaluate("document.documentElement.scrollWidth <= innerWidth"), f"Overflow at {width}"
                    assert page.get_by_text("Celebrating", exact=False).first.is_visible()
                    if width <= 640:
                        page.get_by_role("button", name="Open navigation", exact=True).click()
                        page.locator(".nav-links").get_by_text("About Us", exact=True).click()
                        assert not page.locator(".nav-links").is_visible()
                        page.evaluate("scrollTo(0, 0)")
                    page.screenshot(path=str(screenshot_dir / f"landing-{width}.png"), full_page=True)
                    page.get_by_role("button", name="Open wellness assistant").click()
                    assert page.locator("#chat-panel input, #chat-panel textarea, #chat-panel [contenteditable]").count() == 0
                    assert page.locator("#chat-options button").count() == 7
                    for label in ["Explore Yoga Classes", "Our Locations", "Meet Our Trainers", "Wellness Programs", "Current Offers", "Frequently Asked Questions"]:
                        page.locator("#chat-options").get_by_role("button", name=label, exact=False).click()
                        assert page.locator("#chat-options button").count() > 1
                        page.locator("#chat-main").click()
                    page.locator("#chat-options").get_by_role("button", name="Trial & Appointment Enquiries", exact=False).click()
                    page.locator("#chat-options").get_by_role("button", name="Online Class", exact=True).click()
                    page.locator("#chat-options").get_by_role("button", name="Morning", exact=True).click()
                    page.locator("#chat-options").get_by_role("button", name="Weekday", exact=True).click()
                    assert "Morning" in page.locator("#chat-history").inner_text()
                    page.locator("#chat-back").click()
                    assert page.locator("#chat-options").get_by_role("button", name="Weekday", exact=True).is_visible()
                    page.locator("#chat-options").get_by_role("button", name="Weekday", exact=True).click()
                    page.screenshot(path=str(screenshot_dir / f"chat-{width}.png"))
                    page.locator("#chat-options").get_by_role("button", name="Continue to booking", exact=True).click()
                    assert page.locator("#booking-dialog").is_visible()
                    assert page.get_by_role("button", name="Review booking", exact=False).is_disabled()
                    page.get_by_role("button", name="Next month").click()
                    page.get_by_role("button", name="Previous month").click()
                    page.locator("#back-classes").click()
                    for service in ["online", "studio", "private"]:
                        page.locator(f'[data-service="{service}"]').click()
                        assert page.locator(".calendar-grid").is_visible()
                        page.locator("#back-classes").click()
                    page.locator('[data-service="online"]').click()
                    # Tomorrow or the next non-Sunday date; query the server's date, not browser timezone.
                    day = page.evaluate("""() => {
                      let d = new Date(Studio.data.today + 'T12:00:00');
                      do { d.setDate(d.getDate() + 1); } while (d.getDay() === 0);
                      return [d.getFullYear(), String(d.getMonth()+1).padStart(2,'0'), String(d.getDate()).padStart(2,'0')].join('-');
                    }""")
                    if not page.locator(f'[data-date="{day}"]').count():
                        page.get_by_role("button", name="Next month").click()
                    page.locator(f'[data-date="{day}"]').click()
                    page.locator(".slot-button:not([disabled])").first.click()
                    selected = page.evaluate("booking.selection.starts_at")
                    page.get_by_role("button", name="Review booking", exact=False).click()
                    assert "To be confirmed" in page.locator(".booking-summary").inner_text()
                    page.locator("#review-continue").click()
                    page.locator("#auth-register").click()
                    page.locator("#auth-email").fill(f"browser{width}@example.com")
                    page.locator("#auth-password").fill("browser-password-123")
                    page.locator("#show-password").click()
                    assert page.locator("#auth-password").get_attribute("type") == "text"
                    page.locator("#auth-submit").click()
                    page.locator("#demo-booking").wait_for()
                    assert page.evaluate("booking.selection.starts_at") == selected
                    assert page.locator("#test-payment").is_disabled()
                    page.locator("#sign-out").click()
                    page.locator("#auth-login").click()
                    page.locator("#auth-email").fill(f"browser{width}@example.com")
                    page.locator("#auth-password").fill("incorrect-password")
                    page.locator("#auth-submit").click()
                    page.get_by_text("Email or password is incorrect.", exact=True).wait_for()
                    page.locator("#auth-password").fill("browser-password-123")
                    page.locator("#auth-submit").click()
                    page.locator("#demo-booking").wait_for()
                    assert page.evaluate("booking.selection.starts_at") == selected
                    page.screenshot(path=str(screenshot_dir / f"booking-{width}.png"))
                    assert page.locator("#booking-dialog").evaluate("(d) => d.scrollWidth <= d.clientWidth"), f"Dialog overflow at {width}"
                    page.locator("#demo-booking").click()
                    page.get_by_text("Your demo is complete.", exact=True).wait_for()
                    assert "not a real appointment" in page.locator("#booking-body").inner_text().lower()
                    page.locator("#finish-close").click()
                    page.get_by_role("button", name="Open wellness assistant").click()
                    page.locator("#chat-reset").click()
                    assert page.locator(".chat-bubble").count() == 1
                    page.locator("#chat-minimize").click()
                    # Isolate sessions and reserve a different fixture DB slot for next viewport.
                    page.context.clear_cookies()
                    with closing(sqlite3.connect(app.config["DATABASE"])) as db:
                        db.execute("DELETE FROM bookings")
                        db.commit()
                    print(f"PASS desktop/mobile workflow at {width}x{height}")
                assert not errors, errors
                # Click every decision-tree option through the real DOM.
                report = page.evaluate("""() => {
                  const visited = new Set(), queue = [{key:'main', detail:''}], state = {};
                  let clicks = 0;
                  while(queue.length) {
                    const {key, detail} = queue.shift(), id = key + ':' + detail;
                    if(visited.has(id) || ['section','openBooking'].includes(key)) continue;
                    visited.add(id);
                    const node = chatNode(key,state,detail);
                    if(!node.text || !node.options.length) throw Error('Dead end: '+id);
                    for(const o of node.options) {
                      queue.push({key:o.next,detail:o.detail || ''});
                      if(['section','openBooking'].includes(o.next)) continue;
                      chat.navigate(key, detail);
                      const button = [...document.querySelectorAll('#chat-options button')].find(b => b.textContent === o.label);
                      if(!button) throw Error('Missing button: '+o.label);
                      const oldLength = chat.navigation.length;
                      button.click();
                      if(chat.navigation.length !== oldLength+1) throw Error('Inactive button: '+o.label);
                      clicks++;
                    }
                  }
                  return {nodes:visited.size, clicks};
                }""")
                print(f"PASS {report['nodes']} chatbot nodes, {report['clicks']} DOM option clicks, zero JS runtime errors")
                # The availability failure path offers a real working retry.
                page.goto("http://127.0.0.1:5055")
                page.wait_for_function("() => Boolean(Studio.data)")
                page.route("**/api/availability?*", lambda route: route.abort())
                page.locator("[data-book]").first.click()
                page.locator('[data-service="studio"]').click()
                page.locator(".calendar-day:not([disabled])").last.click()
                page.locator("#retry-slots").wait_for()
                page.unroute("**/api/availability?*")
                page.locator("#retry-slots").click()
                page.wait_for_function("() => !document.getElementById('retry-slots') && !document.getElementById('slots').textContent.includes('Checking')")
                page.keyboard.press("Escape")
                assert not page.locator("#booking-dialog").is_visible()
                print("PASS failed availability/retry and keyboard Escape")
                browser.close()
        finally:
            server.shutdown()


if __name__ == "__main__":
    main()
