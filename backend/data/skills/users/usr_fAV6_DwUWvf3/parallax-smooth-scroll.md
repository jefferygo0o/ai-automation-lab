---
id: parallax-smooth-scroll
name: Parallax & Smooth Scroll Experiences
description: Create buttery-smooth scrolling experiences with parallax effects, video backgrounds, Lenis smooth scroll, locomotive-style scroll animations, and canvas-based scroll scrubbing — pure HTML/CSS/JS or with GSAP.
---

# Parallax & Smooth Scroll Experiences

Create immersive scrolling experiences with parallax depth, smooth scrolling, video backgrounds, and canvas-based scroll scrubbing.

## 1. CSS Parallax (Pure CSS)
```css
.parallax-container {
  perspective: 1px;
  height: 100vh;
  overflow-y: auto;
  overflow-x: hidden;
}
.parallax-layer {
  position: absolute;
  top: 0; left: 0; right: 0; bottom: 0;
}
.parallax-back {
  transform: translateZ(-1px) scale(2);
}
.parallax-front {
  transform: translateZ(0);
}
```

## 2. GSAP Parallax
```javascript
// Parallax on scroll
gsap.to('.parallax-bg', {
  scrollTrigger: {
    trigger: '.section',
    start: 'top bottom',
    end: 'bottom top',
    scrub: true
  },
  y: -100,
  ease: 'none'
});

// Multiple parallax layers
gsap.utils.toArray('.parallax-item').forEach((item, i) => {
  const speed = parseFloat(item.dataset.speed) || 0.1;
  gsap.to(item, {
    y: () => window.innerHeight * speed,
    ease: 'none',
    scrollTrigger: {
      trigger: item.parentElement,
      start: 'top bottom',
      end: 'bottom top',
      scrub: true
    }
  });
});
```

## 3. Smooth Scroll with Lenis
```html
<script src="https://unpkg.com/lenis@1.1.13/dist/lenis.min.js"></script>
```
```javascript
// Initialize Lenis smooth scroll
const lenis = new Lenis({
  duration: 1.2,
  easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
  orientation: 'vertical',
  smoothWheel: true,
  wheelMultiplier: 1,
  smoothTouch: false,
});

// Connect Lenis to GSAP ScrollTrigger
function raf(time) {
  lenis.raf(time);
  requestAnimationFrame(raf);
}
requestAnimationFrame(raf);

// Sync with GSAP
lenis.on('scroll', ScrollTrigger.update);
gsap.ticker.add((time) => lenis.raf(time * 1000));
```

## 4. Video Parallax Section
```html
<section class="relative h-screen overflow-hidden">
  <video class="absolute inset-0 w-full h-full object-cover" autoplay muted loop playsinline>
    <source src="background.mp4" type="video/mp4">
  </video>
  <div class="absolute inset-0 bg-black/40"></div>
  <div class="relative z-10 flex items-center justify-center h-full">
    <div class="text-center text-white max-w-2xl px-6">
      <h2 class="text-4xl md:text-6xl font-serif mb-6">Your Content Here</h2>
      <p class="text-lg text-white/70">Overlay text with cinematic video background</p>
    </div>
  </div>
</section>
```

## 5. Scroll-Controlled Video Playback
```html
<video id="scrubVideo" muted preload="auto" playsinline>
  <source src="sequence.mp4" type="video/mp4">
</video>
```
```javascript
const video = document.getElementById('scrubVideo');
video.addEventListener('loadedmetadata', () => {
  video.currentTime = 0;
  video.pause();
});

// Scrub video with scroll
gsap.to(video, {
  currentTime: video.duration || 1,
  ease: 'none',
  scrollTrigger: {
    trigger: '.video-section',
    start: 'top top',
    end: '+=4000',
    scrub: 1
  }
});
```

## 6. Clip-Path Reveal
```css
.clip-reveal {
  clip-path: inset(0 100% 0 0);
  transition: clip-path 1.2s cubic-bezier(0.77, 0, 0.175, 1);
}
.clip-reveal.visible {
  clip-path: inset(0 0 0 0);
}
```
```javascript
gsap.utils.toArray('.clip-reveal').forEach(el => {
  gsap.to(el, {
    clipPath: 'inset(0 0% 0 0)',
    duration: 1.2,
    ease: 'power4.inOut',
    scrollTrigger: {
      trigger: el,
      start: 'top 80%',
    }
  });
});
```

## 7. Staggered Text Reveal
```javascript
// Split text lines
const text = document.querySelector('.reveal-text');
const chars = text.textContent.split('');
text.innerHTML = chars.map(c => `<span class="char">${c === ' ' ? ' ' : c}</span>`).join('');

// Animate
gsap.from('.char', {
  opacity: 0,
  y: 50,
  rotateX: -90,
  stagger: 0.03,
  duration: 0.6,
  ease: 'back.out(1.7)',
  scrollTrigger: {
    trigger: text,
    start: 'top 80%',
  }
});
```

## 8. Horizontal Scroll Section
```html
<section class="horizontal-section" style="height: 300vh;">
  <div class="horizontal-track" style="display:flex; position:sticky; top:0; height:100vh; overflow:hidden;">
    <div class="panel" style="min-width:100vw; display:flex; align-items:center; justify-content:center;">Panel 1</div>
    <div class="panel" style="min-width:100vw; display:flex; align-items:center; justify-content:center;">Panel 2</div>
    <div class="panel" style="min-width:100vw; display:flex; align-items:center; justify-content:center;">Panel 3</div>
  </div>
</section>
```
```javascript
const panels = gsap.utils.toArray('.panel');
gsap.to(panels, {
  xPercent: -100 * (panels.length - 1),
  ease: 'none',
  scrollTrigger: {
    trigger: '.horizontal-section',
    pin: true,
    scrub: 1,
    end: () => `+=${panels.length * 100}vw`
  }
});
```

## 9. Mouse-Follow Parallax
```javascript
document.addEventListener('mousemove', (e) => {
  const x = (e.clientX / window.innerWidth - 0.5) * 20;
  const y = (e.clientY / window.innerHeight - 0.5) * 20;
  
  gsap.to('.parallax-mouse', {
    x, y,
    duration: 1,
    ease: 'power2.out'
  });
});
```

## 10. Full Page Template
Combine smooth scroll (Lenis) + video hero parallax + clip-path reveals + horizontal scroll section + staggered text reveals.

## Resources
- [Lenis](https://lenis.darkroom.engineering/)
- GSAP: `Relaxkartikey/prior-gsap-animation-portfolio-website-template`
- GitHub: `dangerb3/forest-parallax`, `MohammedCoder05/Parallax-Scrolling-Website-Nature-Themed`
