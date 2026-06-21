---
id: vanta-3d-backgrounds
name: Vanta.js 3D Animated Backgrounds
description: Add stunning animated 3D backgrounds to any website with Vanta.js. Drop-in Three.js-based effects (waves, birds, clouds, fog, stars, etc.) using just a few lines of code.
---

# Vanta.js 3D Animated Backgrounds

Add stunning animated 3D backgrounds to any website with **Vanta.js**. Drop-in animated effects (waves, birds, clouds, fog, stars, etc.) using just a few lines of code — works with any framework (vanilla JS, React, Vue, Angular).

**GitHub:** https://github.com/tengbao/vanta
**Demo Gallery:** https://www.vantajs.com/
**Stars:** ~6,600 | **License:** MIT

## What You Get

- **15+ animated effects**: Waves, Birds, Clouds, Fog, Stars, Rings, Trunk, Topology, Halos, Dots, Globe, Net, Cell, Ripple, etc.
- **Rendered by Three.js** (WebGL) or p5.js
- **Mouse/touch interactive** — backgrounds respond to cursor movement
- **~120kb gzipped** — smaller than comparable background images/videos
- **Works with any framework** — vanilla JS, React, Vue, Angular, Svelte
- **Customizable** — color, speed, zoom, intensity, and per-effect parameters

## Quick Start (Vanilla JS)

### 1. Add script tags to your HTML

```html
<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r134/three.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/vanta/dist/vanta.waves.min.js"></script>
```

### 2. Initialize the effect

```html
<div id="my-background" style="width: 100vw; height: 100vh;">
  <h1>Your content here</h1>
</div>

<script>
VANTA.WAVES('#my-background');
</script>
```

### 3. Full configuration

```javascript
VANTA.WAVES({
  el: '#my-background',
  color: 0x000000,
  waveHeight: 20,
  shininess: 50,
  waveSpeed: 1.5,
  zoom: 0.75,
  mouseControls: true,
  touchControls: true,
  gyroControls: false
});
```

## Available Effects

| Effect | CDN URL | Type |
|--------|---------|------|
| **WAVES** | `vanta/dist/vanta.waves.min.js` | Three.js |
| **BIRDS** | `vanta/dist/vanta.birds.min.js` | Three.js |
| **CLOUDS** | `vanta/dist/vanta.clouds.min.js` | Three.js |
| **CLOUDS2** | `vanta/dist/vanta.clouds2.min.js` | Three.js |
| **FOG** | `vanta/dist/vanta.fog.min.js` | Three.js |
| **RINGS** | `vanta/dist/vanta.rings.min.js` | Three.js |
| **TRUNK** | `vanta/dist/vanta.trunk.min.js` | p5.js |
| **TOPOLOGY** | `vanta/dist/vanta.topology.min.js` | Three.js |
| **STARS** | `vanta/dist/vanta.stars.min.js` | Three.js |
| **GLOBE** | `vanta/dist/vanta.globe.min.js` | Three.js |
| **NET** | `vanta/dist/vanta.net.min.js` | Three.js |
| **CELL** | `vanta/dist/vanta.cell.min.js` | Three.js |
| **DOTS** | `vanta/dist/vanta.dots.min.js` | Three.js |
| **RIPPLE** | `vanta/dist/vanta.ripple.min.js` | p5.js |
| **HALO** | `vanta/dist/vanta.halo.min.js` | p5.js |

## Usage with React (Hooks)

```bash
npm install vanta
```

```jsx
import React, { useState, useEffect, useRef } from 'react';
import BIRDS from 'vanta/dist/vanta.birds.min';

// Make sure THREE is loaded via <script> tag in index.html

const Hero = () => {
  const [vantaEffect, setVantaEffect] = useState(null);
  const myRef = useRef(null);

  useEffect(() => {
    if (!vantaEffect) {
      setVantaEffect(BIRDS({
        el: myRef.current,
        mouseControls: true,
        touchControls: true,
        gyroControls: false,
        scale: 1.0,
        scaleMobile: 1.0
      }));
    }
    return () => {
      if (vantaEffect) vantaEffect.destroy();
    };
  }, [vantaEffect]);

  return <div ref={myRef} style={{ height: '100vh' }}>
    <h1>Foreground content</h1>
  </div>;
};
```

## Usage with Vue

```vue
<template>
  <div ref="vantaRef" style="height: 100vh;">
    Foreground content here
  </div>
</template>

<script>
import BIRDS from 'vanta/dist/vanta.birds.min';

export default {
  mounted() {
    this.vantaEffect = BIRDS({ el: this.$refs.vantaRef });
  },
  beforeDestroy() {
    if (this.vantaEffect) this.vantaEffect.destroy();
  }
};
</script>
```

## Updating & Cleanup

```javascript
// Update options after init
const effect = VANTA.WAVES({ el: '#bg', color: 0x000000 });
effect.setOptions({ color: 0xff88cc });

// Resize when container changes
effect.resize();

// Cleanup
effect.destroy();
```

## Customization Tips

| Parameter | Type | Effect |
|-----------|------|--------|
| `color` | hex | Primary background color |
| `mouseControls` | bool | Respond to mouse movement |
| `touchControls` | bool | Respond to touch |
| `gyroControls` | bool | Use device gyroscope |
| `scale` | float | Canvas resolution scale |
| `scaleMobile` | float | Mobile resolution scale |

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Background not showing | Ensure container has explicit width & height |
| THREE is not defined | Make sure three.min.js script loads before vanta |
| Mobile performance issues | Set `scaleMobile: 0.5` to reduce resolution |
| React strict mode double render | Use a ref to track if effect was already created |
| CDN blocked (China/firewall) | Download vendor files locally from the GitHub repo |
