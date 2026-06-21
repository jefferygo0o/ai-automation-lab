---
id: threejs-portfolio-template
name: Three.js Portfolio Template (GSAP + Tailwind + No Build)
description: Create a bento-grid portfolio with Three.js 3D, GSAP animations, GitHub project auto-population, and dark/light mode — no build step required.
---

# Three.js Portfolio Template (GSAP + Tailwind + No Build)

Create a sleek bento-grid portfolio with **Three.js** 3D elements, **GSAP + ScrollTrigger** animations, auto-populated GitHub projects, and dark/light mode — **no build step required**.

**GitHub:** https://github.com/Lumacodes/devfolio-template
**Demo:** https://luma.is-a.dev
**Stars:** ~2 | **License:** GPL-3.0

## What You Get

- **Three.js** — 3D graphics with MeshPhysicalMaterial
- **GSAP + ScrollTrigger** — Scroll-based reveal animations
- **Tailwind CSS** (via CDN) — Utility-first styling
- **GitHub API integration** — Auto-populates your projects
- **Dark/Light mode** — Toggle theme
- **No build step** — Edit HTML directly, deploy anywhere
- **Bento-grid layout** — Modern, clean design

## Prerequisites

- A code editor
- A GitHub account (for the projects integration)
- A modern browser

## Setup Steps

### 1. Clone the repository

```bash
git clone https://github.com/Lumacodes/devfolio-template.git
cd devfolio-template
```

### 2. Customize your info

Open `index.html` and edit:
- **Name, bio, links** — Find the HTML sections and update with your details
- **Profile image** — Replace or update the image source

### 3. Connect your GitHub

Open `js/main.js` and find this line:

```javascript
const GH_USER = 'yourusername'; // Replace with your GitHub username
```

Change `'yourusername'` to your actual GitHub username.

### 4. Open in browser

Since there's no build step, just open `index.html`:

```bash
# Option A: Direct open
open index.html      # macOS
start index.html     # Windows
xdg-open index.html  # Linux

# Option B: Local server (recommended for animations)
python3 -m http.server 8000
```

## Customization Guide

### Colors

In `index.html`, find the Tailwind config script:

```html
<script>
tailwind.config = {
  theme: {
    extend: {
      colors: {
        primary: '#3b82f6',
        secondary: '#10b981'
      }
    }
  }
};
</script>
```

Change the hex values to your brand colors.

### 3D Elements

Edit `js/threejs.js` to change the 3D object:

```javascript
const material = new THREE.MeshPhysicalMaterial({
  color: 0x3b82f6,      // Change color
  metalness: 0.7,        // Adjust shininess
  roughness: 0.1,        // Surface texture
});

// Change geometry
const geometry = new THREE.IcosahedronGeometry(1.5, 1);
// Try: BoxGeometry, SphereGeometry, TorusGeometry, etc.
```

### Animations

Edit GSAP animations in `js/gsap.js` (or inline in the HTML):

```javascript
// Adjust scroll reveal
gsap.from('.project-card', {
  scrollTrigger: '.project-card',
  opacity: 0,
  y: 30,
  duration: 0.8,
  stagger: 0.15 // Delay between each card
});
```

### Layout

Modify the bento grid classes in `index.html`. Tailwind classes like:
- `grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3` — Control grid columns
- `gap-4` — Spacing between items
- `p-6` — Padding

## Deployment

No build step needed! Deploy to any static host:

- **GitHub Pages** — Push to a repo, enable Pages
- **Vercel** — Connect repo, auto-deploys
- **Netlify** — Drag-and-drop the folder

## Troubleshooting

| Issue | Solution |
|-------|----------|
| GitHub projects not showing | Verify `GH_USER` is set correctly; check browser console for API errors |
| 3D object not rendering | Ensure WebGL is enabled in your browser |
| Dark/light mode not toggling | Check that the theme toggle JS is not blocked |
| Animations not playing | Use a local server (python3 -m http.server) instead of `file://` |
| Tailwind not applied | Check internet connection (Tailwind loaded via CDN) |
