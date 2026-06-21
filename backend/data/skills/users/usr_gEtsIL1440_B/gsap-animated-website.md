---
id: gsap-animated-website
name: GSAP Animated Website Template
description: Build a modern website with GSAP + ScrollTrigger smooth animations, responsive design, and lightbox galleries using the DesignEnd template by AHMAD-JX.
---

# GSAP Animated Website Template

Build a modern, responsive website with stunning GSAP + ScrollTrigger animations using the **DesignEnd** template.

**GitHub:** https://github.com/AHMAD-JX/DesignEnd-Website-Template
**Stars:** ~13 | **License:** MIT

## What You Get

- **GSAP + ScrollTrigger** — Smooth scroll-based animations and transitions
- **Bootstrap** — Responsive grid system and components
- **Fancybox** — Lightbox image galleries
- **Smooth Scroll** — Effortless navigation scrolling
- **Fully Responsive** — Desktop, tablet, mobile
- **Cross-browser compatible**

## Prerequisites

- A modern browser (Chrome, Firefox, Edge, Safari)
- A code editor (VS Code recommended)
- Basic knowledge of HTML, CSS, JS

## Setup Steps

### 1. Clone the repository

```bash
git clone https://github.com/AHMAD-JX/DesignEnd-Website-Template.git
cd DesignEnd-Website-Template
```

### 2. Open in browser

Since this is a static HTML/CSS/JS template, simply open any `.html` file in your browser:

```bash
# Option A: Open directly
open index.html         # macOS
start index.html        # Windows
xdg-open index.html     # Linux

# Option B: Serve with a local server (recommended for animations)
python3 -m http.server 8080
# Then visit http://localhost:8080
```

### 3. Explore the template pages

- `home-1.html` — Main home page
- `service.html` — Services/features page

## Customization

### Changing Colors & Fonts
Edit the CSS files in the `css/` directory.

### Modifying Animations
GSAP animation code is in the `js/` directory. Key areas to customize:

```javascript
// Example: Adjust scroll-triggered animations
gsap.from('.element', {
  scrollTrigger: '.element',
  opacity: 0,
  y: 50,
  duration: 1
});
```

### Adding New Sections
Copy an existing section from the HTML and modify the content. GSAP will automatically handle new animations if classes match.

### Replacing Images
Swap images in the `img/` folder and update HTML `src` attributes.

## Customizing GSAP Animations

| Parameter | Effect |
|-----------|--------|
| `duration` | Animation speed (seconds) |
| `opacity` | Fade in/out (0 to 1) |
| `x` / `y` | Horizontal/vertical movement (px) |
| `scale` | Size transformation |
| `ease` | Timing function (e.g., `"power2.out"`, `"back.inOut"`) |
| `scrollTrigger` | Defines when animation triggers on scroll |

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Animations not playing | Make sure you're using a local server, not `file://` protocol |
| GSAP not loading | Check internet connection (CDN loaded from cloudflare) |
| Layout broken on mobile | Check Bootstrap breakpoints in your HTML classes |
| ScrollTrigger not firing | Ensure the target element exists in the DOM when ScrollTrigger initializes |
