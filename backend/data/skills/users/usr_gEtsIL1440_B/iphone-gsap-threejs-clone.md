---
id: iphone-gsap-threejs-clone
name: Apple iPhone Clone (GSAP + Three.js)
description: Build an Awwwards-quality animated product website combining GSAP animations with Three.js 3D models, inspired by the Apple iPhone 15 Pro site (by adrianhajdin).
---

# Apple iPhone Clone (GSAP + Three.js)

Build an Awwwards-quality animated product website combining **GSAP animations** with **Three.js 3D models**, inspired by the Apple iPhone 15 Pro site. Based on the tutorial by JavaScript Mastery.

**GitHub:** https://github.com/adrianhajdin/iphone
**Live Demo:** https://iphone-doc.vercel.app/
**Stars:** ~1,600 | **License:** MIT

## What You Get

- **GSAP animations** — Subtle, smooth scroll-triggered animations throughout
- **Three.js via React Three Fiber** — 3D iPhone model with color/l size switching
- **Custom video carousel** — GSAP-powered video slider with progress indicators
- **React + Vite + TailwindCSS** — Modern toolchain
- **Fully responsive** — Works on all devices
- **Code architecture** — Reusable components, clean separation

## Tech Stack

| Technology | Purpose |
|------------|---------|
| React.js | UI framework |
| Three.js / React Three Fiber | 3D rendering |
| React Three Drei | 3D helpers (lights, environment) |
| GSAP | Scroll-triggered animations |
| Vite | Build tool |
| Tailwind CSS | Styling |

## Prerequisites

- Node.js (v18+ recommended)
- npm or yarn

## Setup Steps

### 1. Clone the repository

```bash
git clone https://github.com/adrianhajdin/iphone.git
cd iphone
```

### 2. Install dependencies

```bash
npm install
# OR
yarn install
```

### 3. Start development

```bash
npm run dev
```

Open http://localhost:5173. You'll see the iPhone 15 Pro website.

### 4. Build for production

```bash
npm run build
```

## Project Structure

```
├── public/
│   └── assets/           # Images, videos, 3D models
├── src/
│   ├── components/
│   │   ├── Hero.jsx         # Main hero section with 3D model
│   │   ├── Highlights.jsx   # Video carousel section
│   │   ├── Features.jsx     # Feature sections
│   │   ├── HowItWorks.jsx   # How it works section
│   │   ├── Model.jsx        # 3D iPhone model (R3F)
│   │   ├── Lights.jsx       # 3D lighting setup
│   │   └── VideoCarousel.jsx # GSAP-powered carousel
│   ├── constants/
│   │   └── index.js         # Colors, models, nav data
│   ├── utils/
│   │   └── index.js         # Asset imports
│   └── App.jsx
├── index.html
├── vite.config.js
├── tailwind.config.js
└── package.json
```

## Customizing the 3D Model

### Change colors

Edit `src/constants/index.js`:

```javascript
export const models = [
  {
    id: 1,
    title: "iPhone 15 Pro in Natural Titanium",
    color: ["#8F8A81", "#ffe7b9", "#6f6c64"],
    img: yellowImg,
  },
  // Add your own colors and models
];
```

### Adjust animations

GSAP animations are in the components. Customize:

```javascript
// In any component using GSAP
gsap.to(".element", {
  scrollTrigger: {
    trigger: ".element",
    start: "top 80%",
    end: "top 20%",
    scrub: true,
  },
  opacity: 1,
  y: 0,
  duration: 1,
  ease: "power2.out",
});
```

## Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server |
| `npm run build` | Build for production |
| `npm run preview` | Preview production build |
| `npm run lint` | Run ESLint |

## Learning Path

This project was built as part of a **JavaScript Mastery** tutorial. If you want to build it step-by-step:
- YouTube tutorial: [JavaScript Mastery Channel](https://youtube.com/@javascriptmastery)
- The repo has 6 commits showing the progressive build

## Troubleshooting

| Issue | Solution |
|-------|----------|
| 3D model not loading | Check the model file paths in `public/assets/` |
| GSAP animations not firing | Ensure elements are in the DOM before GSAP initializes |
| Video assets missing | Download public assets from the link in the README |
| React strict mode double renders | Use refs to prevent double GSAP instantiation |
| Performance issues | Reduce 3D model polygon count or simplify GSAP timelines |
