from playwright.sync_api import sync_playwright
import time, random, string

def random_user():
    suffix = ''.join(random.choices(string.ascii_lowercase, k=8))
    return f"agent_{suffix}"

uname = random_user()
email = f"{uname}@agent.local"
pword = "TestPass123!"

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    ctx = browser.new_context(viewport={"width": 1280, "height": 900})
    page = ctx.new_page()
    
    # Listen for console messages
    page.on("console", lambda msg: print(f"[CONSOLE] {msg.type}: {msg.text}"))
    page.on("response", lambda resp: print(f"[RESP] {resp.status} {resp.url[:80]}"))
    
    page.goto("https://ai-automation-lab-blackbox.zocomputer.io/")
    page.wait_for_load_state("networkidle")
    time.sleep(2)
    
    # Fill form
    page.locator("input[type=email]").fill(email)
    page.locator("input[type=password]").fill(pword)
    
    # Click create account
    page.locator("button:has-text('Create account')").click()
    time.sleep(5)
    
    print(f"\nFinal URL: {page.url}")
    print(f"Page text: {page.locator('body').inner_text()[:500]}")
    
    cookies = ctx.cookies()
    print(f"\nCookies: {len(cookies)}")
    
    page.screenshot(path="register_result.png", full_page=True)
    browser.close()
