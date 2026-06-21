---
id: gsap-animations
name: GSAP Animations
description: Build scroll-driven, entrance, and timeline animations with GSAP and ScrollTrigger. Patterns distilled from codebucks27/Agency-website and the wider GSAP ecosystem.
---
# GSAP Animations

A reusable procedure for adding motion to web projects with GSAP + ScrollTrigger. Patterns extracted from `codebucks27/Agency-website` (React + GSAP + styled-components, 247★) and `codebucks27/3D-Landing-page-for-Apple-iPhone` (GSAP + Three.js, 106★).

## When to use this skill

Trigger when the user asks for:
- "add scroll animations", "make it animate", "parallax", "GSAP"
- Hero reveals, section transitions, pinned scroll sequences
- Coordinated multi-element timelines

## Procedure

### 1. Confirm stack

Ask one question if needed:
- **Framework**: vanilla JS, React, Vue, Svelte?
- **CSS approach**: Tailwind, styled-components, plain CSS?
- **Focus**: scroll-driven, entrance, hover, or all three?

Recommend the `codebucks27/Agency-website` patterns for React + styled-components, or the IPhone landing page for Three.js + GSAP combos.

### 2. Install

```bash
# Core
npm install gsap

# ScrollTrigger is included in gsap since 3.11; register it:
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
gsap.registerPlugin(ScrollTrigger);
```

For React, also install `@gsap/react` for `useGSAP()`:
```bash
npm install @gsap/react
```

### 3. Core patterns

#### A. Entrance stagger (hero load)

```js
useGSAP(() => {
  gsap.from(".hero-title, .hero-sub, .hero-cta", {
    y: 50,
    opacity: 0,
    duration: 1,
    stagger: 0.15,
    ease: "power3.out",
  });
}, { scope: containerRef });
```

#### B. Scroll-triggered reveal

```js
gsap.from(".section", {
  scrollTrigger: {
    trigger: ".section",
    start: "top 80%",
    end: "bottom 20%",
    toggleActions: "play none none reverse",
  },
  y: 60,
  opacity: 0,
  duration: 1,
  ease: "power2.out",
});
```

#### C. Pinned scroll section (agency hero pattern)

```js
gsap.to(".hero-content", {
  scrollTrigger: {
    trigger: ".hero",
    start: "top top",
    end: "bottom top",
    scrub: 1,           // smooth scrub
    pin: true,
    pinSpacing: false,
  },
  yPercent: -50,
  opacity: 0,
  ease: "none",
});
```

#### D. Parallax background

```js
gsap.to(".bg-image", {
  scrollTrigger: {
    trigger: ".section",
    start: "top bottom",
    end: "bottom top",
    scrub: true,
  },
  yPercent: 30,         // moves slower than scroll
  ease: "none",
});
```

#### E. Horizontal scroll on scroll (cards / panels)

```js
const sections = gsap.utils.toArray(".panel");
gsap.to(sections, {
  xPercent: -100 * (sections.length - 1),
  ease: "none",
  scrollTrigger: {
    trigger: ".horizontal-container",
    pin: true,
    scrub: 1,
    snap: 1 / (sections.length - 1),
    end: () => "+=" + document.querySelector(".horizontal-container").offsetWidth,
  },
});
```

#### F. Timeline (multi-element choreography)

```js
const tl = gsap.timeline({ defaults: { ease: "power2.out" } });
tl.from(".title",    { y: 30, opacity: 0, duration: 0.6 })
  .from(".subtitle", { y: 20, opacity: 0, duration: 0.6 }, "-=0.3")
  .from(".image",    { scale: 0.9, opacity: 0, duration: 0.8 }, "-=0.4")
  .from(".cta",      { y: 10, opacity: 0, duration: 0.4 });
```

### 4. React integration (useGSAP hook)

From `codebucks27/Agency-website` and the official `@gsap/react` package:

```jsx
import { useRef } from "react";
import { useGSAP } from "@gsap/react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(useGSAP, ScrollTrigger);

export default function Hero() {
  const container = useRef(null);

  useGSAP(() => {
    gsap.from(".hero-title", { y: 50, opacity: 0, duration: 1, ease: "power3.out" });
    gsap.from(".hero-sub",   { y: 30, opacity: 0, duration: 1, delay: 0.2, ease: "power3.out" });
  }, { scope: container });

  return (
    <section ref={container}>
      <h1 className="hero-title">Headline</h1>
      <p className="hero-sub">Subhead copy</p>
    </section>
  );
}
```

Why `useGSAP` over raw `useEffect`: it auto-cleans up ScrollTriggers on unmount and handles SSR safely.

### 5. Design tokens from the Agency-website repo

```js
:root {
  --background: #eff7f9;
  --black:      #0a0b10;
  --purple:     #803bec;
  --pink:       #e5a1f8;
  --white:      #fff;
  --nav:        #35353f;
  --nav2:       #3f3d56;
}
body { font-family: 'Poppins', sans-serif; background: var(--background); }
html { scroll-behavior: smooth; }
```

### 6. Performance rules

- Animate `transform` and `opacity` only — never `width`, `height`, `top`, `left`
- Use `will-change: transform` sparingly; remove when done
- Set `lazy: true` on ScrollTriggers below the fold
- Batch ScrollTriggers when possible
- Always check `ScrollTrigger.isTouch` → reduce or disable on mobile
- Respect `prefers-reduced-motion`:

```js
const mm = gsap.matchMedia();
mm.add("(prefers-reduced-motion: no-preference)", () => {
  // all your animations here
});
```

### 7. Common pitfalls

| Symptom | Cause | Fix |
|---|---|---|
| Animation fires before layout ready | No `scope` / no font load | Use `useGSAP` scope or wrap in `ScrollTrigger.refresh()` after fonts load |
| Pinning breaks on mobile | Pinning + small viewport | Use `pin: true` only on `min-width: 768px` via matchMedia |
| Janky scrub | Too many simultaneous triggers | Combine into one timeline per section |
| Flicker on load | Initial state not set | Use `from()` not `to()` for entrance |
| Memory leak on route change | ScrollTriggers not killed | `useGSAP` handles this; in vanilla, store triggers and `trigger.kill()` |

### 8. Deliverable checklist

- [ ] ScrollTrigger registered once
- [ ] All animations cleaned up on unmount
- [ ] `prefers-reduced-motion` respected
- [ ] No layout-triggering properties animated
- [ ] Tested at mobile, tablet, desktop
- [ ] First paint not blocked by animation setup

## Output format

When invoked, produce:
1. The chosen patterns (entrance / scroll / pin / timeline)
2. Ready-to-paste code blocks for each
3. Integration notes for the chosen framework
4. Any cleanup/mobile considerations

## Sources

- https://github.com/codebucks27/Agency-website (247★) — React + GSAP + styled-components agency site
- https://github.com/codebucks27/3D-Landing-page-for-Apple-iPhone (106★) — GSAP + Three.js
- https://github.com/holux-design/v-gsap-nuxt (167★) — GSAP for Nuxt
- https://gsap.com/docs/v3/ — official docs
