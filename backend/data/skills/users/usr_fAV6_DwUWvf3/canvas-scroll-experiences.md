---
id: canvas-scroll-experiences
name: Canvas & Scroll-Based Experiences
description: Create Apple-level cinematic web experiences with canvas frame-scrubbing, video scrub, parallax, and scroll-driven animations — pure HTML/CSS/JS, no frameworks needed.
---

# Canvas & Scroll-Based Experiences

Create Apple-style cinematic web experiences using HTML Canvas, video scrub, and GSAP ScrollTrigger. No frameworks required — just vanilla HTML/CSS/JS.

## Core Concepts
- **Canvas Frame-Scrub**: Scroll drives frame-by-frame canvas animation (like Apple product pages)
- **Video Scrub**: Scroll controls video playback position
- **Parallax Layers**: Multiple speeds for depth effect
- **Clip-Path Reveals**: Scroll-driven shape reveals
- **Cinematic Preloader**: Progressively loaded experience

## 1. Canvas Frame-Scrub (Hero Section)

### HTML
```html
<canvas id="heroCanvas"></canvas>
```

### CSS
```css
#heroCanvas {
  position: fixed;
  top: 0; left: 0;
  width: 100vw;
  height: 100vh;
  object-fit: cover;
}
```

### JavaScript
```javascript
const canvas = document.getElementById('heroCanvas');
const ctx = canvas.getContext('2d');
const frameCount = 147;
const images = [];

// Set canvas size
function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// Preload frames
for (let i = 0; i < frameCount; i++) {
  const img = new Image();
  img.src = `frames/frame_${String(i).padStart(4, '0')}.jpg`;
  images.push(img);
}

// Render function
function renderFrame(index) {
  const i = Math.min(Math.max(0, Math.floor(index)), frameCount - 1);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  if (images[i] && images[i].complete) {
    const img = images[i];
    const scale = Math.max(
      canvas.width / img.width,
      canvas.height / img.height
    );
    const x = (canvas.width - img.width * scale) / 2;
    const y = (canvas.height - img.height * scale) / 2;
    ctx.drawImage(img, x, y, img.width * scale, img.height * scale);
  }
}

// GSAP ScrollTrigger scrub
gsap.to(canvas, {
  scrollTrigger: {
    trigger: 'body',
    start: 'top top',
    end: '+=4000',
    scrub: 1,
  },
  currentFrame: frameCount - 1,
  ease: 'none',
  onUpdate: function() {
    renderFrame(this.targets()[0].currentFrame);
  }
});
```

## 2. Video Scrub
```html
<video id="scrubVideo" preload="auto" muted playsinline>
  <source src="hero-video.mp4" type="video/mp4">
</video>
```
```javascript
const video = document.getElementById('scrubVideo');

video.addEventListener('loadedmetadata', () => {
  gsap.to(video, {
    scrollTrigger: {
      trigger: '.video-section',
      start: 'top top',
      end: '+=5000',
      scrub: 1,
    },
    currentTime: video.duration,
    ease: 'none',
  });
});
```

## 3. Parallax Layers
```html
<div class="parallax-container">
  <div class="layer" data-speed="0.2">Background</div>
  <div class="layer" data-speed="0.5">Midground</div>
  <div class="layer" data-speed="0.9">Foreground</div>
</div>
```
```css
.parallax-container {
  height: 200vh;
  position: relative;
  overflow: hidden;
}
.layer {
  position: fixed;
  top: 0; left: 0;
  width: 100%; height: 100%;
  will-change: transform;
}
```
```javascript
document.querySelectorAll('.layer').forEach(layer => {
  const speed = parseFloat(layer.dataset.speed);
  gsap.to(layer, {
    scrollTrigger: {
      trigger: '.parallax-container',
      start: 'top top',
      end: 'bottom bottom',
      scrub: true,
    },
    y: (i, target) => -(target.offsetHeight * (1 - speed)),
    ease: 'none',
  });
});
```

## 4. Clip-Path Scroll Reveal
```html
<div class="clip-section">
  <div class="clip-content">
    <h2>Reveal Title</h2>
    <p>Content appears as you scroll</p>
  </div>
</div>
```
```javascript
gsap.from('.clip-content', {
  scrollTrigger: {
    trigger: '.clip-section',
    start: 'top 80%',
    end: 'center center',
    scrub: 1,
  },
  clipPath: 'inset(0 100% 0 0)',
  duration: 1,
  ease: 'power4.inOut',
});
```

## 5. Smooth Text Reveal
```javascript
// Split text animation
function splitReveal(selector) {
  const el = document.querySelector(selector);
  if (!el) return;
  
  const text = el.textContent;
  el.textContent = '';
  
  text.split('').forEach((char, i) => {
    const span = document.createElement('span');
    span.textContent = char;
    span.style.display = 'inline-block';
    el.appendChild(span);
  });
  
  gsap.from(`${selector} span`, {
    scrollTrigger: selector,
    opacity: 0,
    y: 20,
    rotateX: -90,
    duration: 0.4,
    stagger: 0.03,
    ease: 'power2.out',
  });
}
```

## 6. Progress Bar / Scroll Indicator
```html
<div id="scrollBar"></div>
```
```css
#scrollBar {
  position: fixed;
  top: 0; left: 0;
  height: 3px;
  background: #c9a84c;
  z-index: 9999;
  width: 0%;
}
```
```javascript
gsap.to('#scrollBar', {
  scrollTrigger: {
    trigger: 'body',
    start: 'top top',
    end: 'bottom bottom',
    scrub: 0.5,
  },
  width: '100%',
  ease: 'none',
});
```

## 7. Full Cinematic Preloader
```html
<div id="loader">
  <div class="loader-inner">
    <div class="loader-counter">0%</div>
    <div class="loader-bar"><div class="loader-progress"></div></div>
  </div>
</div>
```
```javascript
// Resource tracking
const resources = document.querySelectorAll('img, video[preload]');
let loaded = 0;
const total = resources.length;

resources.forEach(el => {
  if (el.tagName === 'IMG') {
    if (el.complete) loaded++;
    else el.addEventListener('load', () => updateProgress());
  } else {
    el.addEventListener('loadeddata', () => updateProgress());
  }
});

function updateProgress() {
  loaded++;
  const percent = Math.round((loaded / total) * 100);
  document.querySelector('.loader-counter').textContent = `${percent}%`;
  gsap.to('.loader-progress', { width: `${percent}%`, duration: 0.3 });
  
  if (loaded >= total) {
    gsap.to('#loader', { opacity: 0, duration: 0.6, delay: 0.3, onComplete: () => {
      document.getElementById('loader').remove();
    }});
  }
}
```

## Quick Reference: ScrollTrigger Parameters
| Parameter | Description | Example |
|-----------|-------------|---------|
| `trigger` | Element that triggers animation | `.my-section` |
| `start` | When animation starts | `'top 80%'` |
| `end` | When animation ends | `'bottom top'` |
| `scrub` | Links animation to scroll position | `1` (smooth), `true` (linked) |
| `pin` | Pin element while scrolling | `true` |
| `toggleActions` | Control play direction | `'play none none reverse'` |
| `markers` | Show debug markers | `true` (dev only) |

## Performance
- Use `loading="lazy"` on images
- Compress frame sequences to JPEG
- Implement `matchMedia` to disable heavy effects on mobile
- Target 60fps — test on mid-range devices
- Preload next frames using requestAnimationFrame

## Resources
- GitHub: `Relaxkartikey/prior-gsap-animation-portfolio-website-template`
- GSAP ScrollTrigger: https://gsap.com/docs/v3/Plugins/ScrollTrigger/
