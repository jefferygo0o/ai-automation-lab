"""Browser automation demo — a visual tour!"""
from playwright.sync_api import sync_playwright
import os

OUTPUT_DIR = "browser_demo"
os.makedirs(OUTPUT_DIR, exist_ok=True)

def step(msg):
    print(f"\n{'='*60}")
    print(f"  🎬 {msg}")
    print(f"{'='*60}")

with sync_playwright() as p:
    browser = p.chromium.launch(
        headless=True,
        executable_path='/usr/bin/chromium'
    )
    page = browser.new_page(viewport={'width': 1280, 'height': 800})

    # 1. Visit Hacker News
    step("1. Visiting Hacker News...")
    page.goto("https://news.ycombinator.com", wait_until="networkidle")
    page.screenshot(path=f"{OUTPUT_DIR}/01_hacker_news.png")
    
    # Get top story titles
    titles = page.eval_on_selector_all(
        ".titleline > a",
        "els => els.slice(0, 5).map(el => el.textContent)"
    )
    print(f"   Top 5 stories:")
    for i, t in enumerate(titles, 1):
        print(f"   {i}. {t}")

    # 2. Click the "new" link
    step("2. Clicking 'new' to see latest stories...")
    page.click('a:has-text("new")')
    page.wait_for_load_state("networkidle")
    page.screenshot(path=f"{OUTPUT_DIR}/02_new_stories.png")
    print("   ✅ Loaded newest submissions")

    # 3. Go to Wikipedia and search something
    step("3. Going to Wikipedia...")
    page.goto("https://en.wikipedia.org", wait_until="networkidle")
    page.screenshot(path=f"{OUTPUT_DIR}/03_wikipedia.png")
    
    # Search for "Python programming"
    step("4. Searching for 'AI agent' on Wikipedia...")
    page.fill("input[name='search']", "AI agent")
    page.press("input[name='search']", "Enter")
    page.wait_for_load_state("networkidle")
    page.screenshot(path=f"{OUTPUT_DIR}/04_wiki_search.png")
    
    # Get the first paragraph
    first_para = page.eval_on_selector(
        ".mw-parser-output > p",
        "el => el.textContent"
    )
    print(f"   📖 First paragraph:")
    print(f"   {first_para[:200]}...")

    # 5. Visit a fun interactive site — Hacker News' ASCII art
    step("5. Let's find something fun — going to lorem ipsum generator...")
    page.goto("https://loripsum.net/", wait_until="networkidle")
    page.screenshot(path=f"{OUTPUT_DIR}/05_lorem_ipsum.png")
    
    # Get some generated text
    text = page.eval_on_selector("p", "el => el.textContent")
    print(f"   📝 Generated text: {text[:150]}...")

    # 6. Finale — create a collage description
    step("6. 🎉 Demo complete!")
    print(f"\n   Screenshots saved to: {OUTPUT_DIR}/")
    print(f"   1. 01_hacker_news.png  — Front page of HN")
    print(f"   2. 02_new_stories.png  — Newest submissions")
    print(f"   3. 03_wikipedia.png    — Wikipedia homepage")
    print(f"   4. 04_wiki_search.png  — Search results for 'AI agent'")
    print(f"   5. 05_lorem_ipsum.png  — Lorem ipsum generator")

    browser.close()
    print(f"\n   ✅ Browser session complete!")
