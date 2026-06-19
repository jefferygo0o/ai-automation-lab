---
id: tiktok-upload
name: TikTok Video Upload
description: Upload videos to TikTok using browser automation (Playwright) or direct API (Requests). Supports scheduling, hashtags, custom covers, and multi-account management.
---

# TikTok Video Upload Skill

Upload videos to TikTok using either the Playwright-based `tiktok-uploader` library (recommended) or the direct-API `TiktokAutoUploader`.

## Prerequisites

- Python 3.10+
- Playwright browsers installed (`playwright install`)
- A TikTok account with cookies exported

## Installation Options

### Option A: tiktok-uploader (Playwright-based, recommended)
```bash
pip install tiktok-uploader
playwright install chromium
```

### Option B: TiktokAutoUploader (Requests-based, fastest)
```bash
git clone https://github.com/makiisthenes/TiktokAutoUploader.git
cd TiktokAutoUploader
pip install -r requirements.txt
cd tiktok_uploader/tiktok-signature && npm install && cd ../..
npx --prefix tiktok_uploader/tiktok-signature playwright install chromium
```

## Step 1: Authenticate (Export Cookies)

### Method 1: Browser Extension (Easiest)
1. Install the "🍪 Get cookies.txt" browser extension (Chrome/Firefox)
2. Go to https://www.tiktok.com and log into your account
3. Click the extension icon → "Export As" → save as `cookies.txt`

### Method 2: JavaScript Console
1. Go to https://www.tiktok.com and log in
2. Open DevTools (F12) → Console tab
3. Paste and run this script:
```javascript
(function(){
  const c = document.cookie.split("; ").map(x=>{
    const i = x.indexOf("=");
    return ".tiktok.com\tTRUE\t/\tFALSE\t2147483647\t" + x.substring(0,i) + "\t" + x.substring(i+1)
  }).join("\n");
  const b = new Blob([c], {type:"text/plain"});
  const a = document.createElement("a");
  a.href = URL.createObjectURL(b);
  a.download = "cookies.txt";
  a.textContent = "Download cookies.txt";
  a.style = "position:fixed;top:20px;right:20px;z-index:9999;padding:10px;background:#fe2c55;color:white;border-radius:5px;text-decoration:none;font-weight:bold;font-family:sans-serif;";
  document.body.appendChild(a);
  if (!document.cookie.includes("sessionid")) alert("⚠️ sessionid is missing (HttpOnly). You must add it manually!");
})();
```
4. Click the "Download cookies.txt" button
5. If alerted about missing `sessionid`, go to Application → Cookies, copy `sessionid`, and add it manually to cookies.txt:
   ```
   .tiktok.com	TRUE	/	FALSE	2147483647	sessionid	YOUR_SESSION_ID
   ```

## Step 2: Upload a Video

### Using tiktok-uploader (Library)

```python
from tiktok_uploader.upload import TikTokUploader

# Single video upload
uploader = TikTokUploader(cookies="cookies.txt")
uploader.upload_video(
    "video.mp4",
    description="Check out this awesome video! #fyp #trending"
)

# With custom cover, comments on, stitch on
uploader.upload_video(
    "video.mp4",
    description="#fyp @user Mention",
    cover="thumbnail.jpg",
    comment=True,
    stitch=True,
    duet=False
)

# Schedule for later (UTC, min 20 min ahead, max 10 days)
import datetime
schedule = datetime.datetime.now() + datetime.timedelta(hours=2)
uploader.upload_video("video.mp4", description="Scheduled post", schedule=schedule)

# Multiple videos
videos = [
    {"path": "video1.mp4", "description": "First video #fyp"},
    {"path": "video2.mp4", "description": "Second video #viral"}
]
failed = uploader.upload_videos(videos=videos)

# Headless mode
uploader = TikTokUploader(cookies="cookies.txt", headless=True)
```

### Using tiktok-uploader (CLI)
```bash
# Basic upload
tiktok-uploader -v video.mp4 -d "My awesome TikTok" -c cookies.txt

# Schedule
tiktok-uploader -v video.mp4 -d "Scheduled video" -c cookies.txt -t 7200

# With proxy
tiktok-uploader -v video.mp4 -d "Video with proxy" -c cookies.txt --proxy http://user:pass@host:port
```

### Using TiktokAutoUploader (Fast API-based)
```bash
# Login first (opens Chrome, you log in manually)
python3 cli.py login -n my_account

# Upload a local video
python3 cli.py upload --user my_account -v "video.mp4" -t "My video title #fyp"

# Upload from YouTube link (auto-downloads)
python3 cli.py upload --user my_account -yt "https://www.youtube.com/shorts/xxxxx" -t "My title"

# Schedule (e.g., 2 hours from now = 7200 seconds)
python3 cli.py upload --user my_account -v "video.mp4" -t "Scheduled video" -sc 7200

# Private video, no comments
python3 cli.py upload --user my_account -v "video.mp4" -t "Private video" -vi 1 -ct 0
```

## Step 3: Verify Upload

After uploading, verify by:
1. Checking the function return value — `upload_video()` returns True on success
2. Checking the failed list — `upload_videos()` returns a list of failed videos (empty = all succeeded)
3. Manually visiting your TikTok profile page

## Troubleshooting

| Issue | Solution |
|-------|----------|
| **"sessionid is missing"** | Manually add `sessionid` from DevTools → Application → Cookies |
| **Upload fails silently** | Wait several hours between uploads (rate limiting) |
| **ChromeDriver version mismatch** | Update Chrome or let the tool auto-detect |
| **Playwright not found** | Run `playwright install chromium` |
| **Video format error** | Ensure video is MP4 with H.264 codec, max 10 min, max 2GB |
| **Proxy not working** | Only Chrome supports user:pass proxy auth currently |

## Notes
- This is not a spam tool. Upload too many videos too fast and TikTok may temporarily restrict your account.
- Use scheduling (minimum 20 min ahead, max 10 days) for consistent posting.
- Cookies expire periodically — re-export them when uploads start failing.
- Headless mode is supported and reduces detection risk.
