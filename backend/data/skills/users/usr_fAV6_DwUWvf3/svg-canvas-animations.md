---
id: svg-canvas-animations
name: SVG & Canvas Interactive Graphics
description: Create stunning animated SVGs, interactive canvas graphics, particle systems, data visualizations, and animated icons using vanilla JS, GSAP, and Canvas API — perfect for hero backgrounds, logos, charts, and decorative elements.
---

# SVG & Canvas Interactive Graphics

Create production-grade animated graphics using SVG and HTML Canvas. Covers animated logos, particle systems, data visualization, interactive backgrounds, and decorative elements.

## 1. Animated SVG Logo
```html
<svg viewBox="0 0 200 60" xmlns="http://www.w3.org/2000/svg">
  <text x="10" y="40" font-family="Playfair Display, Georgia, serif" font-size="28" font-weight="700" fill="#c9a84c">
    ESQUIRE
    <animate attributeName="opacity" from="0" to="1" dur="1s" fill="freeze"/>
  </text>
  <text x="130" y="40" font-family="Inter, sans-serif" font-size="16" font-weight="300" fill="white" opacity="0">
    LAW UK
    <animate attributeName="opacity" from="0" to="1" dur="0.8s" begin="0.8s" fill="freeze"/>
  </text>
  <!-- Animated underline -->
  <line x1="10" y1="48" x2="0" y2="48" stroke="#c9a84c" stroke-width="1.5">
    <animate attributeName="x2" from="0" to="180" dur="0.6s" begin="1.5s" fill="freeze"/>
  </line>
</svg>
```

## 2. GSAP SVG Path Animation
```html
<svg viewBox="0 0 400 200">
  <path id="myPath" d="M10 100 Q100 10 200 100 T390 100" fill="none" stroke="#c9a84c" stroke-width="2"/>
  <circle id="dot" r="4" fill="#c9a84c"/>
</svg>
```
```javascript
// Animate circle along path
gsap.to('#dot', {
  motionPath: {
    path: '#myPath',
    align: '#myPath',
    alignOrigin: [0.5, 0.5]
  },
  duration: 3,
  repeat: -1,
  ease: 'none'
});

// Draw path progressively
gsap.to('#myPath', {
  strokeDashoffset: 0,
  duration: 2,
  ease: 'power2.inOut',
  scrollTrigger: {
    trigger: '#myPath',
    start: 'top 80%'
  }
});
```

## 3. Animated Gold Horizontal Rule
```html
<svg class="gold-divider" width="80" height="4" viewBox="0 0 80 4">
  <line x1="0" y1="2" x2="80" y2="2" stroke="#c9a84c" stroke-width="2" 
    stroke-dasharray="80" stroke-dashoffset="80"
    stroke-linecap="round"/>
</svg>
```
```css
.gold-divider line {
  animation: drawLine 1s ease-out forwards;
}
@keyframes drawLine {
  to { stroke-dashoffset: 0; }
}
```

## 4. Canvas Particle Background
```html
<canvas id="particles"></canvas>
```
```javascript
const canvas = document.getElementById('particles');
const ctx = canvas.getContext('2d');
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

class Particle {
  constructor() { this.reset(); }
  reset() {
    this.x = Math.random() * canvas.width;
    this.y = Math.random() * canvas.height;
    this.size = Math.random() * 2 + 0.5;
    this.speedX = (Math.random() - 0.5) * 0.5;
    this.speedY = (Math.random() - 0.5) * 0.5;
    this.opacity = Math.random() * 0.5 + 0.1;
  }
  update() {
    this.x += this.speedX;
    this.y += this.speedY;
    if (this.x < 0 || this.x > canvas.width) this.speedX *= -1;
    if (this.y < 0 || this.y > canvas.height) this.speedY *= -1;
  }
  draw() {
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(201, 168, 76, ${this.opacity})`;
    ctx.fill();
  }
}

const particles = Array.from({length: 80}, () => new Particle());

function animateParticles() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  particles.forEach(p => {
    p.update();
    p.draw();
  });
  
  // Connect nearby particles
  particles.forEach((a, i) => {
    particles.slice(i + 1).forEach(b => {
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 150) {
        ctx.strokeStyle = `rgba(201, 168, 76, ${0.1 * (1 - dist / 150)})`;
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
    });
  });
  
  requestAnimationFrame(animateParticles);
}
animateParticles();

window.addEventListener('resize', () => {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
});
```

## 5. Animated Icons (Hamburger to X)
```css
.hamburger { display:flex; flex-direction:column; gap:5px; cursor:pointer; background:none; border:none; padding:5px; }
.hamburger span { display:block; width:28px; height:2px; background:#c9a84c; transition:all 0.3s; }
.hamburger.active span:nth-child(1) { transform:rotate(45deg) translate(5px, 5px); }
.hamburger.active span:nth-child(2) { opacity:0; }
.hamburger.active span:nth-child(3) { transform:rotate(-45deg) translate(5px, -5px); }
```

## 6. Counter Animation
```html
<h3 class="counter" data-target="2500">0</h3>
```
```javascript
gsap.utils.toArray('.counter').forEach(counter => {
  const target = parseInt(counter.dataset.target);
  gsap.from(counter, {
    innerText: 0,
    duration: 2,
    ease: 'power2.out',
    snap: { innerText: 1 },
    scrollTrigger: { trigger: counter, start: 'top 80%' },
    onUpdate: function() {
      counter.innerText = Math.round(this.targets()[0].innerText);
    }
  });
});
```

## 7. SVG Gradient Background
```html
<svg class="bg-glow" viewBox="0 0 1440 900" preserveAspectRatio="none" style="position:fixed;top:0;left:0;width:100%;height:100%;z-index:-1;">
  <defs>
    <radialGradient id="glow1" cx="20%" cy="50%" r="50%">
      <stop offset="0%" stop-color="rgba(201,168,76,0.08)"/>
      <stop offset="100%" stop-color="transparent"/>
    </radialGradient>
    <radialGradient id="glow2" cx="80%" cy="20%" r="50%">
      <stop offset="0%" stop-color="rgba(201,168,76,0.05)"/>
      <stop offset="100%" stop-color="transparent"/>
    </radialGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#glow1)"/>
  <rect width="100%" height="100%" fill="url(#glow2)"/>
</svg>
```

## 8. Data Visualization (Simple Bar Chart)
```html
<div class="chart" style="display:flex;align-items:flex-end;gap:12px;height:200px;">
  <div class="bar" data-value="85" style="width:40px;background:#c9a84c;"></div>
  <div class="bar" data-value="92" style="width:40px;background:#c9a84c;"></div>
  <div class="bar" data-value="78" style="width:40px;background:#c9a84c;"></div>
  <div class="bar" data-value="95" style="width:40px;background:#c9a84c;"></div>
</div>
```
```javascript
gsap.utils.toArray('.bar').forEach(bar => {
  const value = bar.dataset.value;
  gsap.set(bar, { height: 0 });
  gsap.to(bar, {
    height: `${value * 2}px`,
    duration: 1.2,
    ease: 'back.out(1.7)',
    scrollTrigger: { trigger: bar, start: 'top 80%' }
  });
});
```

## 9. Loading Spinner (SVG)
```html
<svg class="spinner" width="40" height="40" viewBox="0 0 40 40">
  <circle cx="20" cy="20" r="16" fill="none" stroke="#c9a84c" stroke-width="3" 
    stroke-dasharray="100" stroke-dashoffset="0"
    stroke-linecap="round">
    <animateTransform attributeName="transform" type="rotate" from="0 20 20" to="360 20 20" dur="1s" repeatCount="indefinite"/>
    <animate attributeName="stroke-dashoffset" values="100;0;100" dur="1.5s" repeatCount="indefinite"/>
  </circle>
</svg>
```

## 10. Interactive Grid Overlay Pattern
```css
.hero-pattern {
  position:absolute;inset:0;pointer-events:none;
  background-image:
    linear-gradient(rgba(201,168,76,0.03) 1px, transparent 1px),
    linear-gradient(90deg, rgba(201,168,76,0.03) 1px, transparent 1px);
  background-size: 60px 60px;
}
```

## Resources
- [GSAP MotionPath](https://gsap.com/docs/v3/Plugins/MotionPathPlugin)
- [MDN Canvas API](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API)
- [SVG Animation Guide](https://css-tricks.com/guide-svg-animations/)
