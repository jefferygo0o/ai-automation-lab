---
id: gsap-threejs-template
name: GSAP + Three.js Animated Website Template
description: Create a futuristic animated website combining GSAP animations with Three.js 3D elements using the RobotAI template by AHMAD-JX.
---

# GSAP + Three.js Animated Website Template

Create a futuristic, animated website combining **GSAP** animations with **Three.js** 3D elements using the **RobotAI** template.

**GitHub:** https://github.com/AHMAD-JX/RobotAI-3DAnimated-Website-Template
**Stars:** ~9 | **License:** MIT

## What You Get

- **GSAP** — Smooth timeline-based animations
- **Three.js** — 3D rendered elements
- **SCSS** — Advanced CSS preprocessing
- **Fully Responsive** — Flexbox & Grid layout
- **Modern UI** — Futuristic visual design
- **Cross-browser compatible**

## Prerequisites

- A modern browser
- A code editor
- Basic HTML/CSS/JS knowledge

## Setup Steps

### 1. Clone the repository

```bash
git clone https://github.com/AHMAD-JX/RobotAI-3DAnimated-Website-Template.git
cd RobotAI-3DAnimated-Website-Template
```

### 2. Serve locally

This is a static template — serve it with a local server for best results:

```bash
# Using Python
python3 -m http.server 8080

# OR using Node (if you have live-server installed)
npx live-server
```

Then open http://localhost:8080.

### 3. Open directly (basic)

You can open `index.html` directly, but some features may not work without a server.

## Customization

### Adjusting GSAP Animations

Animation code is embedded in the HTML/JS files. Look for `gsap` calls:

```javascript
// Adjust timing and effects
gsap.to('.element', {
  duration: 1.5,
  opacity: 1,
  y: 0,
  ease: 'power3.out',
  scrollTrigger: {
    trigger: '.element',
    start: 'top 80%',
    end: 'top 20%',
    scrub: true
  }
});
```

### Modifying Three.js 3D Elements

Three.js code creates 3D visuals. Key customization points:

```javascript
// Change 3D object color, size, position
const material = new THREE.MeshStandardMaterial({
  color: 0x4a9eff,
  metalness: 0.5,
  roughness: 0.2
});
```

### Changing Styles

Edit the SCSS/CSS files in the `assets/` directory:
- **Colors** — Update CSS custom properties or SCSS variables
- **Layout** — Modify Flexbox/Grid classes
- **Typography** — Change font families and sizes

### Replacing Content

Edit `index.html` to change:
- Text content (headings, paragraphs, buttons)
- Images and icons (replace in `assets/`)
- Links and navigation items

## GSAP + Three.js Best Practices

| Practice | Why |
|----------|-----|
| Use `scrollTrigger` for scroll-based animations | Creates immersive storytelling experiences |
| Keep Three.js scene lightweight | Heavy 3D can impact performance on mobile |
| Match animation speed to brand tone | Slow = elegant, fast = energetic |
| Test on multiple devices | 3D + animation performance varies widely |

## Troubleshooting

| Issue | Solution |
|-------|----------|
| 3D elements not displaying | Check WebGL support in browser (`chrome://gpu`) |
| Animations laggy | Reduce Three.js polygon count or GSAP concurrent animations |
| Layout breaks on mobile | Adjust responsive breakpoints in CSS |
| Server required for some features | Use `python3 -m http.server` instead of opening file directly |
