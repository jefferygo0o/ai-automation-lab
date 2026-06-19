#!/usr/bin/env python3
"""
Daily Digest Generator — automation demo script.
Fetches a random fact, generates a timestamped digest file.
"""
import urllib.request
import json
from datetime import datetime
import os
import sys

DIGEST_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "digests")
os.makedirs(DIGEST_DIR, exist_ok=True)

def fetch_json(url):
    req = urllib.request.Request(url, headers={"User-Agent": "DigestBot/1.0"})
    with urllib.request.urlopen(req, timeout=10) as resp:
        return json.loads(resp.read().decode())

def get_random_fact():
    try:
        data = fetch_json("https://uselessfacts.jsph.pl/api/v2/facts/random?language=en")
        return data.get("text", "No fact available.")
    except Exception as e:
        return f"Could not fetch fact: {e}"

def get_random_quote():
    try:
        data = fetch_json("https://api.quotable.io/random")
        return f'"{data.get("content", "???")}" — {data.get("author", "Unknown")}'
    except Exception as e:
        return f"Could not fetch quote: {e}"

def main():
    now = datetime.now()
    date_str = now.strftime("%A, %B %d, %Y")
    time_str = now.strftime("%H:%M:%S")
    timestamp = now.strftime("%Y%m%d_%H%M%S")
    filename = f"digest_{timestamp}.txt"
    filepath = os.path.join(DIGEST_DIR, filename)

    print(f"🤖 Generating daily digest...")
    print(f"📅 {date_str} at {time_str}")
    print()

    fact = get_random_fact()
    quote = get_random_quote()

    content = f"""
╔══════════════════════════════════════════════╗
║          🌅 DAILY DIGEST                      ║
║          {date_str}                     ║
╚══════════════════════════════════════════════╝

⏰ Generated at: {time_str}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📌 RANDOM FACT:
   {fact}

💬 QUOTE OF THE MOMENT:
   {quote}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✨ Have a great day!
"""

    with open(filepath, "w") as f:
        f.write(content)

    print(content)
    print(f"✅ Saved to: {filepath}")
    return filepath

if __name__ == "__main__":
    path = main()
    print(f"\n📁 Output: {path}")
