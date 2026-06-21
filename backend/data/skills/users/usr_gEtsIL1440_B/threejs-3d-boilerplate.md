---
id: threejs-3d-boilerplate
name: Three.js 3D Boilerplate (Vite + GLSL + TailwindCSS)
description: Kickstart a 3D web app or landing page with Three.js, GLSL shaders, Vite, TailwindCSS 4 using the doinel1a/vite-three-js boilerplate.
---

# Three.js 3D Boilerplate (Vite + GLSL + TailwindCSS)

Kickstart a 3D web app, SPA, or landing page with **Three.js**, GLSL shaders, Vite, and TailwindCSS 4 using the **vite-three-js** boilerplate.

**GitHub:** https://github.com/doinel1a/vite-three-js
**Demo:** https://vite-three-js.d1a.app
**Stars:** ~94 | **License:** MIT

## What You Get

- **Three.js** — 3D graphics library
- **GLSL** — Custom shader support
- **Vite** — Lightning-fast dev/build
- **TailwindCSS 4** — Utility-first CSS
- **ESLint + Prettier** — Code quality
- **Husky + Commitlint + Lint-Staged** — Git hooks
- **Playwright** — E2E tests
- **SASS/SCSS** support
- **92.3% browser coverage**

## Prerequisites

- Node.js (latest LTS)
- pnpm, yarn, or bun (optional — npm works)

## Setup Steps

### 1. Clone the template

```bash
git clone https://github.com/doinel1a/vite-three-js YOUR-PROJECT-NAME
cd YOUR-PROJECT-NAME
```

### 2. Choose ONE package manager & clean up

Delete the lock files for package managers you're NOT using (keep only the one matching your choice).

### 3. Install dependencies

```bash
npm install
# OR
pnpm install
# OR
bun install
# OR
yarn install
```

### 4. Start development

```bash
npm run dev
```

Open http://localhost:5173. You should see a 3D scene.

### 5. Build for production

```bash
npm run build
```

Output goes to `dist/`.

## Project Structure

```
├── public/                # Static assets
├── src/
│   ├── scripts/
│   │   ├── app.js         # Main Three.js entry
│   │   ├── world/         # 3D scene components
│   │   │   ├── World.js   # Scene, camera, renderer
│   │   │   ├── systems/   # Control systems
│   │   │   └── objects/   # 3D objects
│   ├── shaders/           # GLSL shaders
│   │   ├── vertex.glsl
│   │   └── fragment.glsl
│   ├── styles/
│   └── index.html
├── vite.config.js
├── tailwind.config.js
└── package.json
```

## Customizing the 3D Scene

### Add a custom 3D object

In `src/scripts/world/objects/`, create a new file:

```javascript
import * as THREE from 'three';

export default class MyObject {
  constructor() {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshStandardMaterial({ color: 0x00ff00 });
    this.mesh = new THREE.Mesh(geometry, material);
  }
}
```

### Add custom GLSL shaders

Edit `src/shaders/vertex.glsl` and `src/shaders/fragment.glsl` for custom visual effects.

### Change scene background

In `World.js`:
```javascript
this.scene.background = new THREE.Color(0x1a1a2e);
```

## Key Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server |
| `npm run build` | Build for production |
| `npm run preview` | Preview production build |
| `npm run lint` | Run ESLint |
| `npm run format` | Run Prettier |
| `npm run test` | Run Playwright tests |

## Troubleshooting

| Issue | Solution |
|-------|----------|
| 3D scene blank | Check browser console for errors; ensure WebGL is supported |
| Shader compilation errors | Verify GLSL syntax; check console for shader error messages |
| Lock file conflicts | Keep only ONE lock file for your package manager |
| Port in use | Vite will auto-assign next available port |
| Three.js version mismatch | Check `package.json` for exact three version |
