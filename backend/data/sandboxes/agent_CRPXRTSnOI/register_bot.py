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
    
    # 1. Go to the site
    page.goto("https://ai-automation-lab-blackbox.zocomputer.io/")
    page.wait_for_load_state("networkidle")
    time.sleep(1)
    
    # 2. Fill in email and password
    page.locator("input[type=email]").fill(email)
    page.locator("input[type=password]").fill(pword)
    
    # 3. Click "Create account"
    page.locator("button:has-text('Create account')").click()
    time.sleep(3)
    
    page.screenshot(path="register_result.png", full_page=True)
    
    # Check what happened
    text = page.locator("body").inner_text()
    print("Page after register:", text[:600])
    
    # Check URL
    print("Current URL:", page.url)
    
    # Save cookies for later
    cookies = ctx.cookies()
    print(f"\nGot {len(cookies)} cookies")
    for c in cookies:
        print(f"  {c['name']}: {c['value'][:30]}...")
    
    # Try to find settings or profile
    for kw in ["settings", "profile", "dashboard", "agent", "config"]:
        link = page.locator(f"a, button, [role=button]").filter(has_text=kw)
        count = link.count()
        if count > 0:
            print(f"  Found '{kw}' element: {count}")
    
    page.screenshot(path="after_register.png", full_page=True)
    
    browser.close()
