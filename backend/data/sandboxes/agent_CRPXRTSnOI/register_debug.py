from playwright.sync_api import sync_playwright
import time, random, string

uname = "agent_" + ''.join(random.choices(string.ascii_lowercase, k=8))
email = f"{uname}@agent.local"
pword = "TestPass123!"

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    ctx = browser.new_context(viewport={"width": 1280, "height": 900})
    page = ctx.new_page()
    
    # Capture all requests
    requests_log = []
    page.on("request", lambda req: requests_log.append(f"[REQ] {req.method} {req.url}"))
    page.on("response", lambda resp: requests_log.append(f"[RESP] {resp.status} {resp.url}"))
    page.on("console", lambda msg: requests_log.append(f"[CONSOLE] {msg.type}: {msg.text}"))
    
    page.goto("https://ai-automation-lab-blackbox.zocomputer.io/")
    page.wait_for_load_state("networkidle")
    time.sleep(2)
    
    print("=== Initial page loaded ===")
    
    # Fill the form
    email_input = page.locator("input[type=email]")
    pass_input = page.locator("input[type=password]")
    email_input.fill(email)
    pass_input.fill(pword)
    print(f"Filled: {email} / {pword}")
    
    # Check the button state
    btn = page.locator("button:has-text('Create account')")
    print(f"Button disabled: {btn.is_disabled()}")
    print(f"Button visible: {btn.is_visible()}")
    
    # Check if there's JS errors
    time.sleep(1)
    
    # Click it
    print("Clicking Create account...")
    btn.click()
    time.sleep(5)
    
    print(f"\nURL after click: {page.url}")
    print(f"Body text: {page.locator('body').inner_text()[:500]}")
    
    # Check all inputs again
    all_inputs = page.locator("input").all()
    for inp in all_inputs:
        val = inp.input_value()
        pid = inp.get_attribute("placeholder") or ""
        print(f"  Input placeholder='{pid}' value='{val}'")
    
    print("\n=== Network log ===")
    for log in requests_log:
        print(log)
    
    # Also try with "I have an account" toggle
    toggle = page.locator("a, button, span").filter(has_text="I have an account")
    if toggle.count() > 0:
        print(f"\n'Sign in' toggle found: {toggle.count()}")
        toggle.first.click()
        time.sleep(2)
        print(f"After toggle: {page.locator('body').inner_text()[:300]}")
    
    browser.close()
