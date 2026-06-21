---
id: gsap-advanced-animations
name: GSAP Advanced Animations
description: Create stunning scroll-triggered animations, canvas frame-scrubbing, parallax effects, clip-path reveals, and cinematic preloaders using GSAP ScrollTrigger — pure HTML/CSS/JS, no frameworks needed.
---

# GSAP Advanced Animations

Create production-grade scroll-driven animations using GSAP (GreenSock Animation Platform) and ScrollTrigger. This skill covers everything from basic reveals to cinematic canvas frame-scrubbing.

## Prerequisites
- Basic HTML, CSS, JavaScript knowledge
- GSAP CDN: `https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js`
- ScrollTrigger CDN: `https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/ScrollTrigger.min.js`

## Setup
```html
<script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/ScrollTrigger.min.js"></script>
```

## Techniques

### 1. Basic Scroll-Triggered Fade-In
```javascript
gsap.from('.element', {
  scrollTrigger: '.element',
  opacity: 0,
  y: 50,
  duration: 1,
  ease: 'power2.out'
});
```

### 2. Staggered Reveals (Lists & Grids)
```javascript
gsap.from('.card', {
  scrollTrigger: '.cards-grid',
  opacity: 0,
  y: 60,
  duration: 0.8,
  stagger: 0.15,
  ease: 'power3.out'
});
```

### 3. Parallax Video Section
```html
<section class="parallax-section">
  <div class="parallax-bg">
    <video src="bg.mp4" autoplay muted loop></video>
  </div>
  <div class="parallax-content">
    <h2>Content Over Video</h2>
  </div>
</section>
```
```css
.parallax-section { position: relative; height: 100vh; overflow: hidden; }
.parallax-bg { position: fixed; top: 0; left: 0; width: 100%; height: 100%; z-index: 0; }
.parallax-bg video { width: 100%; height: 100%; object-fit: cover; }
.parallax-content { position: relative; z-index: 1; }
```
```javascript
gsap.to('.parallax-bg', {
  scrollTrigger: '.parallax-section',
  y: '30%',
  scale: 1.1,
  ease: 'none'
});
```

### 4. Clip-Path Reveal
```javascript
gsap.from('.clip-reveal', {
  scrollTrigger: '.clip-reveal',
  clipPath: 'inset(0 100% 0 0)',
  duration: 1.2,
  ease: 'power4.inOut'
});
```

### 5. Canvas Frame-Scrub (Apple-style)
```html
<canvas id="heroCanvas"></canvas>
```
```javascript
const canvas = document.getElementById('heroCanvas');
const ctx = canvas.getContext('2d');
const frameCount = 147;
const images = [];

// Preload frames
for (let i = 0; i < frameCount; i++) {
  const img = new Image();
  img.src = `frames/frame_${String(i).padStart(4, '0')}.jpg`;
  images.push(img);
}

// Render frame
function renderFrame(index) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(images[index], 0, 0, canvas.width, canvas.height);
}

// Scroll scrub
gsap.to(canvas, {
  scrollTrigger: {
    trigger: '.hero',
    start: 'top top',
    end: '+=4000',
    scrub: 1
  },
  currentFrame: frameCount - 1,
  ease: 'none',
  onUpdate: function() {
    renderFrame(Math.round(this.targets()[0].currentFrame));
  }
});
```

### 6. Cinematic Preloader
```javascript
const loader = document.querySelector('.loader');
const progress = document.querySelector('.loader-progress');
let total = 0, loaded = 0;

// Track asset loading
gsap.to(progress, {
  width: '100%',
  duration: 3,
  ease: 'power2.inOut',
  onComplete: () => {
    gsap.to(loader, { opacity: 0, duration: 0.5, delay: 0.3, onComplete: () => loader.remove() });
  }
});
```

## Design System (CSS Custom Properties)
```css
:root {
  --primary: #1a1a2e;
  --accent: #e94560;
  --gold: #c9a84c;
  --text: #ffffff;
  --bg-dark: #0f0f1a;
}
```

## Responsive Considerations
- Use `matchMedia` for tablet/mobile ScrollTrigger toggling
```javascript
let mm = gsap.matchMedia();
mm.add('(min-width: 768px)', () => {
  // Desktop-only animations
});
mm.add('(max-width: 767px)', () => {
  // Mobile fallbacks
});
```

## Performance Tips
- Use `will-change: transform` on animated elements
- Enable GPU acceleration: `force3D: true`
- Limit canvas resolution to device pixel ratio
- Use `scrub: 1` (not true) for smoother scroll-linked animations
- Reduce frame count on mobile

## Quick Start Template
```html
<!DOCTYPE html>
<html>
<head><!-- GSAP CDN + styles --></head>
<body>
  <div class="hero"><canvas id="scrubCanvas"></canvas></div>
  <section class="content"><!-- staggered cards --></section>
  <section class="parallax"><!-- video + overlay --></section>
  <script src="gsap.min.js"></script>
  <script src="ScrollTrigger.min.js"></script>
  <script>// Your GSAP timeline</script>
</body>
</html>
```

## Resources
- [GSAP Docs](https://gsap.com/docs/)
- [ScrollTrigger Docs](https://gsap.com/docs/v3/Plugins/ScrollTrigger/)
- GitHub templates: `Relaxkartikey/prior-gsap-animation-portfolio-website-template`, `RedolentHalo/discord-bot-website-template`
