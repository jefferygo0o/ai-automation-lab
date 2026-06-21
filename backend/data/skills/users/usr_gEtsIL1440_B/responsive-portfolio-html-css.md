---
id: responsive-portfolio-html-css
name: Responsive Portfolio Website (HTML/CSS/JS)
description: Build a clean, responsive personal portfolio website using only HTML, CSS, and JavaScript. Mobile-first, with dark/light mode, smooth scrolling, and no build tools required.
---

# Responsive Portfolio Website (HTML/CSS/JS)

Build a clean, responsive personal portfolio website using only **HTML, CSS, and JavaScript**. Mobile-first design, dark/light mode toggle, smooth scrolling — no build tools or frameworks needed.

**GitHub:** https://github.com/bedimcode/responsive-portfolio-website-Alexa
**Video Tutorial:** https://youtu.be/27JtRAI3QO8
**Stars:** ~2,700 | **License:** MIT

## What You Get

- **Mobile-first design** — Optimized for all screen sizes
- **Dark/Light mode toggle** — Theme switcher built-in
- **Smooth scrolling** — Navigation between sections
- **Clean animations** — Subtle CSS transitions and reveals
- **Pure HTML/CSS/JS** — No build step, no frameworks
- **Professional layout** — About, Skills, Portfolio, Contact sections

## Prerequisites

- A code editor (VS Code recommended)
- A modern browser

## Setup Steps

### 1. Clone the repository

```bash
git clone https://github.com/bedimcode/responsive-portfolio-website-Alexa.git
cd responsive-portfolio-website-Alexa
```

### 2. Open in browser

```bash
# Option A: Open directly
open index.html      # macOS
start index.html     # Windows
xdg-open index.html  # Linux

# Option B: Local server (recommended)
python3 -m http.server 8000
# Visit http://localhost:8000
```

## Customization

### 1. Personal Info

Edit `index.html` to change:
- **Name and title** — Find the `<h1>` and subtitle tags
- **About section** — Update the bio text
- **Profile image** — Replace `assets/img/profile.jpg` with your photo
- **Social links** — Update the href attributes in the social icons
- **Portfolio projects** — Replace project images and descriptions

### 2. Colors & Theme

Open `assets/css/styles.css` and find the CSS custom properties:

```css
:root {
  --first-color: #6e57e0;       /* Primary accent color */
  --first-color-alt: #5a43c8;   /* Hover state */
  --title-color: #2c2c2c;       /* Dark mode heading color */
  --text-color: #555;           /* Body text */
  --body-color: #fcfcfc;        /* Light mode background */
  --container-color: #fff;      /* Card backgrounds */
}

/* Dark mode colors */
body.dark-theme {
  --title-color: #f1f1f1;
  --text-color: #b0b0b0;
  --body-color: #1a1a2e;
  --container-color: #25253e;
}
```

### 3. Dark/Light Mode

The toggle button is already implemented in `assets/js/main.js`. To customize:

```javascript
// Add or remove other dark-theme adjustments
document.getElementById('theme-button').addEventListener('click', () => {
  document.body.classList.toggle('dark-theme');
});
```

### 4. Sections

The template includes these sections:
- **Home** — Hero section with profile image
- **About** — Bio and personal details
- **Skills** — Skill bars or icons
- **Portfolio** — Project gallery with images
- **Contact** — Contact form and information
- **Footer** — Social links and copyright

### 5. Animations

CSS animations are in `styles.css`. Key customizations:

```css
/* Scroll reveal animation */
.scroll-reveal {
  opacity: 0;
  transform: translateY(30px);
  transition: all 0.6s ease;
}

.scroll-reveal.active {
  opacity: 1;
  transform: translateY(0);
}
```

## Deploying

Since this is pure HTML/CSS/JS, deploy to any static host:

| Platform | How To |
|----------|--------|
| **GitHub Pages** | Push to repo → Settings → Pages → select `main` branch |
| **Netlify** | Drag & drop the folder |
| **Vercel** | Install CLI → `vercel` |
| **Cloudflare Pages** | Connect repo, auto-deploys |

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Dark mode not saving | Add `localStorage` persistence in `main.js` |
| Mobile menu not working | Check the hamburger toggle JS in `main.js` |
| Images not showing | Verify file paths — images are in `assets/img/` |
| Smooth scroll not working | Check your browser supports `scroll-behavior: smooth` |
| CSS not applying | Ensure `styles.css` link is correct in `<head>` |
