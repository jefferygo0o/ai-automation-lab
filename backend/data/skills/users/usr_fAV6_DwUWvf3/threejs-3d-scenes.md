---
id: threejs-3d-scenes
name: Three.js 3D Scenes
description: Build immersive 3D website experiences using Three.js, React Three Fiber, and GSAP — render 3D models, create scroll-driven 3D animations, and build product showcase landing pages.
---

# Three.js 3D Scenes

Build immersive 3D website experiences using Three.js integrated with React and GSAP. Covers 3D model rendering, scroll-driven animations, lighting, and product showcase pages.

## Prerequisites
- React.js (18+)
- Node.js & npm
- Basic knowledge of 3D concepts

## Core Libraries
```json
{
  "three": "^0.160.0",
  "@react-three/fiber": "^8.15.0",
  "@react-three/drei": "^9.88.0",
  "gsap": "^3.12.5"
}
```
```bash
npm install three @react-three/fiber @react-three/drei gsap
```

## 1. Basic Scene Setup
```jsx
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Environment } from '@react-three/drei';

export default function Scene() {
  return (
    <Canvas camera={{ position: [0, 0, 5], fov: 45 }}>
      <ambientLight intensity={0.5} />
      <directionalLight position={[5, 5, 5]} intensity={1} />
      <mesh>
        <torusKnotGeometry args={[1, 0.3, 100, 16]} />
        <meshStandardMaterial color="#c9a84c" metalness={0.8} roughness={0.2} />
      </mesh>
      <OrbitControls enableZoom={false} />
      <Environment preset="city" />
    </Canvas>
  );
}
```

## 2. Loading & Displaying a 3D Model (GLTF/GLB)
```jsx
import { useGLTF, Html } from '@react-three/drei';
import { Suspense } from 'react';

function Model({ url, scale = 1, position = [0,0,0] }) {
  const { scene } = useGLTF(url);
  return <primitive object={scene} scale={scale} position={position} />;
}

export default function ProductShowcase() {
  return (
    <Canvas>
      <Suspense fallback={<Html center>Loading 3D Model...</Html>}>
        <Model url="/models/iphone.glb" scale={2} />
        <Environment preset="studio" />
      </Suspense>
    </Canvas>
  );
}
```

## 3. Scroll-Driven 3D Rotation
```jsx
import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

function RotatingModel() {
  const meshRef = useRef();

  // GSAP scroll-driven rotation
  useFrame(() => {
    // Use ScrollTrigger progress
    const progress = ScrollTrigger.getById('modelRotate')?.progress || 0;
    if (meshRef.current) {
      meshRef.current.rotation.y = progress * Math.PI * 2;
    }
  });

  return (
    <mesh ref={meshRef}>
      <torusKnotGeometry args={[1, 0.4, 128, 16]} />
      <meshStandardMaterial color="#c9a84c" metalness={0.9} roughness={0.1} />
    </mesh>
  );
}
```

## 4. Interactive 3D Landing Page Template
```jsx
// pages/index.jsx
import { Canvas } from '@react-three/fiber';
import { Environment, OrbitControls } from '@react-three/drei';
import { Model } from '../components/Model';
import { Overlay } from '../components/Overlay';

export default function Home() {
  return (
    <div style={{ height: '300vh' }}>
      <div style={{ position: 'sticky', top: 0, height: '100vh' }}>
        <Canvas camera={{ position: [0, 0, 8], fov: 50 }}>
          <ambientLight intensity={0.3} />
          <spotLight position={[10, 10, 10]} angle={0.15} penumbra={1} />
          <Suspense fallback={null}>
            <Model url="/models/product.glb" />
            <Environment preset="sunset" />
          </Suspense>
        </Canvas>
      </div>
      <div style={{ position: 'relative', zIndex: 10, marginTop: '100vh' }}>
        {/* Content sections scroll over 3D scene */}
        <section style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <h2 style={{ color: 'white', fontSize: '3rem' }}>Section 1</h2>
        </section>
        <section style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <h2 style={{ color: 'white', fontSize: '3rem' }}>Section 2</h2>
        </section>
      </div>
    </div>
  );
}
```

## 5. iPhone/Product Showcase Pattern
```jsx
// Scroll-controlled model opacity and scale
import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

function ProductModel({ modelUrl }) {
  const group = useRef();

  useFrame(() => {
    const st = ScrollTrigger.getById('product');
    if (st && group.current) {
      const p = st.progress;
      group.current.scale.set(0.5 + p * 0.5, 0.5 + p * 0.5, 0.5 + p * 0.5);
      group.current.rotation.y = p * 0.5;
    }
  });

  return (
    <group ref={group}>
      <Model url={modelUrl} />
    </group>
  );
}
```

## 6. Advanced: 3D Text with Canvas Fallback
```jsx
import { Text3D } from '@react-three/drei';

function Title3D({ text = 'ESQUIRE LAW', color = '#c9a84c' }) {
  return (
    <Text3D
      font="/fonts/Playfair_Display_Bold.json"
      size={0.5}
      height={0.1}
      curveSegments={12}
      position={[-2, 0, 0]}
    >
      {text}
      <meshStandardMaterial color={color} metalness={0.7} roughness={0.3} />
    </Text3D>
  );
}
```

## 7. Loading Screen with Progress
```jsx
import { useProgress, Html } from '@react-three/drei';

function Loader() {
  const { progress } = useProgress();
  return (
    <Html center>
      <div style={{ color: 'white', fontFamily: 'Inter' }}>
        <div style={{ width: 200, height: 4, background: '#333' }}>
          <div style={{ width: `${progress}%`, height: '100%', background: '#c9a84c' }} />
        </div>
        <p style={{ marginTop: 8, fontSize: 14 }}>{Math.round(progress)}%</p>
      </div>
    </Html>
  );
}
```

## Performance Optimization
- Use `performance.min` in production
- Limit polygon count on mobile
- Compress textures (WebP, Basis)
- Use `@react-three/drei` `useProgress` for loading states
- Implement LOD (Level of Detail) for distant objects

## Project Structure
```
project/
├── public/
│   ├── models/        # .glb/.gltf files
│   └── textures/      # Image textures
├── components/
│   ├── Scene.jsx      # Canvas wrapper
│   ├── Model.jsx      # GLTF loader
│   ├── Overlay.jsx    # HTML overlay
│   └── Effects.jsx    # Post-processing
└── pages/
    └── index.jsx      # Landing page
```

## Resources
- [Three.js Docs](https://threejs.org/docs/)
- [React Three Fiber Docs](https://docs.pmnd.rs/react-three-fiber)
- [Drei Docs](https://github.com/pmndrs/drei)
- GitHub: `codebucks27/3D-Landing-page-for-Apple-iPhone`, `Itssanthoshhere/Macbook-Landing-Page`
- Free 3D models: [Sketchfab](https://sketchfab.com), [Poly Haven](https://polyhaven.com)
