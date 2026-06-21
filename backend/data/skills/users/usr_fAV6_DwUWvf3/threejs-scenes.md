---
id: threejs-scenes
name: Three.js Scenes
description: Build 3D web scenes with Three.js and react-three-fiber. Patterns distilled from ladunjexa/reactjs18-3d-portfolio and the wider Three.js + React ecosystem.
---
# Three.js Scenes

A reusable procedure for adding 3D to web projects with Three.js + react-three-fiber + drei. Patterns extracted from `ladunjexa/reactjs18-3d-portfolio` (React + Three.js + Framer Motion + Tailwind, 731★) and `hmans/composer-suite` (Three.js + React game-dev suite, 558★).

## When to use this skill

Trigger when the user asks for:
- "add 3D", "Three.js scene", "WebGL", "3D model in browser"
- 3D hero, product viewer, interactive globe, particles, 3D portfolio
- Combining 3D with React (most common case)

## Procedure

### 1. Confirm stack

Ask one question if needed:
- **Framework**: React (recommended), Vue, vanilla?
- **R3F or vanilla Three.js?** R3F if React — it's the standard.
- **Asset type**: GLTF model, primitives (sphere/cube), particles, custom geometry?

For most cases, recommend `ladunjexa/reactjs18-3d-portfolio` patterns (R3F + drei + Tailwind).

### 2. Install (React path)

```bash
npm install three @react-three/fiber @react-three/drei
npm install -D @types/three
```

`@react-three/drei` is the helper library with `<OrbitControls>`, `<Environment>`, `<Stage>`, `<Float>`, `<Stars>`, etc.

### 3. Project structure (from the 3D portfolio repo)

```
src/
├── components/
│   ├── canvas/         # 3D components (live inside <Canvas>)
│   │   ├── Computers.tsx
│   │   ├── Ball.tsx
│   │   ├── Earth.tsx
│   │   └── Stars.tsx
│   ├── sections/       # Page sections (DOM)
│   └── layout/
├── hoc/
│   └── SectionWrapper.tsx   # HOC that adds padding + nav anchor
├── utils/
│   └── motion.ts            # Framer Motion variants
└── constants/
    └── config.ts            # Content data
```

Convention: anything inside `<Canvas>` lives in `components/canvas/`. DOM sections live in `components/sections/`.

### 4. Core patterns

#### A. Canvas + Scene root

```tsx
import { Canvas } from "@react-three/fiber";

<Canvas
  shadows
  camera={{ position: [0, 0, 5], fov: 45 }}
  gl={{ preserveDrawingBuffer: true }}
>
  <Suspense fallback={null}>
    <ambientLight intensity={0.5} />
    <directionalLight position={[5, 5, 5]} intensity={1} />
    <Computers />
  </Suspense>
  <OrbitControls enableZoom={false} />
</Canvas>
```

#### B. GLTF model (from Computers.tsx)

```tsx
import { useGLTF } from "@react-three/drei";

export function Computers({ isMobile }) {
  const computer = useGLTF("./desktop_pc/scene.gltf");
  return (
    <primitive
      object={computer.scene}
      scale={isMobile ? 0.7 : 0.75}
      position={isMobile ? [0, -3, -2.2] : [0, -3.25, -1.5]}
      rotation={[-0.01, -0.2, -0.1]}
    />
  );
}
```

Place the model under `public/` so the URL is `./desktop_pc/scene.gltf`.

#### C. Responsive model (the key pattern)

```tsx
import { useState, useEffect } from "react";

export function ResponsiveModel() {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 768px)");
    const handle = () => setIsMobile(mq.matches);
    handle();
    mq.addEventListener("change", handle);
    return () => mq.removeEventListener("change", handle);
  }, []);

  return <Computers isMobile={isMobile} />;
}
```

#### D. Stars / particles (from Stars.tsx)

```tsx
import { Points, PointMaterial } from "@react-three/drei";
import * as THREE from "three";
import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";

export function Stars() {
  const ref = useRef<THREE.Points>(null!);
  const positions = useMemo(() => {
    const arr = new Float32Array(5000 * 3);
    for (let i = 0; i < 5000; i++) {
      arr[i * 3]     = (Math.random() - 0.5) * 100;
      arr[i * 3 + 1] = (Math.random() - 0.5) * 100;
      arr[i * 3 + 2] = (Math.random() - 0.5) * 100;
    }
    return arr;
  }, []);

  useFrame((_, delta) => { ref.current.rotation.x += delta / 30; });

  return (
    <Points ref={ref} positions={positions} stride={3} frustumCulled={false}>
      <PointMaterial transparent color="#f272c8" size={0.1} sizeAttenuation />
    </Points>
  );
}
```

#### E. Earth with texture (from Earth.tsx)

```tsx
import { useTexture, Sphere } from "@react-three/drei";

export function Earth() {
  const tex = useTexture("./planet/textures/..."); // daymap, normalMap, specularMap
  return (
    <Sphere args={[2.5, 64, 64]}>
      <meshStandardMaterial map={tex.daymap} normalMap={tex.normalMap} />
    </Sphere>
  );
}
```

#### F. Animated ball with icon texture (from Ball.tsx)

```tsx
import { useTexture, Decal } from "@react-three/drei";
import { useRef } from "react";
import { useFrame } from "@react-three/fiber";

export function Ball({ iconUrl }) {
  const ref = useRef();
  const tex = useTexture(iconUrl);
  useFrame((_, delta) => { ref.current.rotation.y += delta; });
  return (
    <mesh ref={ref} castShadow receiveShadow>
      <icosahedronGeometry args={[1, 1]} />
      <meshStandardMaterial color="#fff8eb" polygonOffset polygonOffsetFactor={-5} />
      <Decal position={[0, 0, 1]} rotation={[2 * Math.PI, 0, 6.25]} scale={1} map={tex} />
    </mesh>
  );
}
```

### 5. DOM + 3D layering

The portfolio repo's signature trick: stack a 3D `<Canvas>` behind DOM sections using absolute positioning.

```tsx
<div className="relative z-0 w-full h-screen">
  <div className="absolute inset-0 z-0">
    <Canvas>...</Canvas>
  </div>
  <div className="relative z-10">
    <Hero />
  </div>
</div>
```

Tailwind: `relative z-0` on the wrapper, `absolute inset-0 z-0` on the canvas container, `relative z-10` on the content. The DOM scrolls over the canvas, and the canvas reacts to scroll position via `useScroll` or `useFrame`.

### 6. Performance rules

- **One Canvas per page**, not per section
- **Lazy load** the Canvas: `React.lazy()` + `Suspense`
- **Throttle on mobile**: drop particle counts, lower DPR
  ```tsx
  <Canvas dpr={[1, 2]} performance={{ min: 0.5 }}>
  ```
- **Dispose GLTF**: `useGLTF.preload(url)` once; drei handles it
- **Suspense fallback**: use `null` or a simple loader — never a heavy DOM tree
- **Skip on low-end**: check `navigator.hardwareConcurrency` and skip 3D if ≤ 2

### 7. Common pitfalls

| Symptom | Cause | Fix |
|---|---|---|
| Black canvas | Missing lights or camera inside object | Add `ambientLight` + check `camera.position` |
| Model not visible | Wrong scale or position | Start `scale={1}` `position={[0,0,0]}`, then adjust |
| Flicker on scroll | Canvas re-creates | Wrap in a memoized component, key by route |
| Mobile broken | DPR too high, particles too dense | Lower DPR + reduce particle count for `isMobile` |
| Textures 404 | Wrong path | Place under `public/`, reference as `./folder/file.png` |
| Z-fighting on decals | Overlapping geometry | Add `polygonOffset` + `polygonOffsetFactor={-5}` |

### 8. Deliverable checklist

- [ ] One Canvas per page
- [ ] Responsive model variants (mobile vs desktop)
- [ ] Lights + camera set explicitly
- [ ] Suspense fallback in place
- [ ] Performance throttled on mobile
- [ ] GLTF/textures under `public/`
- [ ] Reduced-motion / low-end fallback considered

## Output format

When invoked, produce:
1. The chosen pattern (hero model / particles / globe / product viewer)
2. Ready-to-paste R3F components
3. Asset placement under `public/`
4. Performance + responsive notes
5. Integration with chosen UI framework

## Sources

- https://github.com/ladunjexa/reactjs18-3d-portfolio (731★) — React + Three.js + Framer Motion
- https://github.com/hmans/composer-suite (558★) — Three.js + React game/VFX
- https://github.com/codebucks27/3D-Landing-page-for-Apple-iPhone (106★) — Three.js + GSAP
- https://github.com/chingu-voyages/v43-tier3-team-29 (117★) — Three.js + Theatre.js
- https://threejs.org/docs/ — official docs
- https://github.com/pmndrs/react-three-fiber — R3F
- https://github.com/pmndrs/drei — drei helpers
