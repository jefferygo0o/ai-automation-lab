---
id: website-design
name: Website Design Patterns
description: Curated design patterns and inspiration for building distinctive websites, based on the awesome-web-desktops directory and modern portfolio/design references.
---
# Website Design Patterns

A reusable procedure for designing distinctive, memorable websites. Distilled from `syxanash/awesome-web-desktops` (2k+ stars) and adjacent design references.

## When to use this skill

Trigger this skill when the user asks for:
- "design a website", "build a landing page", "create a portfolio"
- A site with personality (retro OS, brutalist, minimal, editorial, etc.)
- Inspiration or patterns for layouts, navigation, typography, motion

## Procedure

### 1. Clarify the brief

Ask one question if the brief is ambiguous:
- **Audience + goal** (who is this for, what action do they want?)
- **Tone** (playful, minimal, editorial, retro, brutalist, luxury, technical)
- **Reference vibe** (any sites they admire?)

If they reference a category (e.g. "retro OS", "minimal"), pull concrete examples from the curated list below.

### 2. Pick a design direction

Pick ONE primary direction and commit. Mixing more than two weakens the result.

| Direction | Best for | Hallmarks |
|---|---|---|
| Retro OS / Web Desktop | Personal sites, portfolios, experimental | Draggable windows, taskbar, pixel fonts, CRT effects |
| Minimal / Swiss | Agencies, products, content | Generous whitespace, one accent color, large type |
| Editorial / Magazine | Blogs, long-form, brands | Multi-column grid, drop caps, serif headlines |
| Brutalist | Designers, devs, art | Raw borders, monospace, system fonts, harsh contrast |
| 3D / Immersive | Product launches, portfolios | WebGL/Three.js hero, scroll-driven 3D |
| Glassmorphism / Aurora | SaaS, dashboards | Blur, gradients, soft shadows, dark mode |

### 3. Use the curated reference set

The `awesome-web-desktops` repo catalogs 200+ sites. Use these as visual reference (do NOT clone — they exist for inspiration):

**Retro OS classics (open source):**
- `blueedgetechno/win11React` — Windows 11 in React
- `1j01/98` — Windows 98 in JS
- `khang-nd/win7` — Windows 7 in HTML/CSS/JS
- `DustinBrett/daedalOS` — Desktop OS in browser
- `prozilla-os/ProzillaOS` — Modern web desktop
- `puruvj/macos-web` — macOS in Svelte
- `Renovamen/playground-macos` — Xiaohan Zou's macOS playground
- `victorqribeiro/fos` — Victor Ribeiro's desktop
- `ducbao414/win32.run` — win32 runtime in browser

**Modern portfolio references (open source):**
- `ladunjexa/reactjs18-3d-portfolio` — React + Three.js + Framer Motion
- `codebucks27/Agency-website` — React + GSAP + styled-components
- `henryjeff/portfolio-website` — Clean editorial portfolio
- `vivek9patel/vivek9patel.github.io` — Classic dev portfolio

**Minimal / experimental:**
- `lyoshenka/awesome-motherfucking-website` — Curated minimal sites
- `windows93dotnet/sys42` — Windows 93 (maximalist retro)
- `captbaritone/webamp` — Winamp in browser

### 4. Design system rules

Always establish these before writing code:

```
:root {
  --bg: <one base color>;
  --fg: <one text color>;
  --accent: <one accent color>;
  --muted: <derived gray>;
  --radius: <consistent radius scale>;
  --space: <4px or 8px base unit>;
  --font-display: <one headline font>;
  --font-body: <one body font>;
}
```

Constraints that produce good design:
- **One typeface pairing** (display + body), max two
- **One accent color** used sparingly (≤10% of viewport)
- **Consistent spacing scale** (4 or 8 px base, never random)
- **Mobile-first** — design for 375px first, scale up
- **Dark/light parity** — if you ship dark mode, design it from day one

### 5. Layout primitives

Pick from these proven patterns:

- **Hero → Sections → Footer** (most reliable)
- **Asymmetric grid** for editorial feel
- **Sticky sidebar + scroll content** for docs/portfolios
- **Full-bleed sections** alternating with contained content
- **Card grid** with consistent gutters and aspect ratios

### 6. Motion principles

Motion should serve comprehension, not decorate:
- **Entrance**: stagger children 50–100ms apart, ease-out
- **Scroll**: parallax only on hero; subtle elsewhere
- **Hover**: 150–250ms, ease-out, transform-only (no layout shift)
- **Page transitions**: 300–500ms, cross-fade or slide
- Respect `prefers-reduced-motion` — disable non-essential animation

### 7. Deliverable checklist

Before declaring done:
- [ ] Lighthouse perf ≥ 90, a11y ≥ 95
- [ ] Works at 320px, 768px, 1024px, 1440px
- [ ] All interactive elements keyboard-accessible
- [ ] Focus states visible
- [ ] Color contrast WCAG AA
- [ ] Images have `alt`, decorative ones `alt=""`
- [ ] Meta tags + OG image set

## Output format

When invoked, produce:
1. A short design rationale (1 paragraph)
2. The chosen direction + 2–3 reference sites from the list
3. The design tokens (colors, type, spacing)
4. The component breakdown (hero, nav, sections, footer)
5. Implementation notes (any motion library, framework hints)

## Source

Patterns distilled from:
- https://github.com/syxanash/awesome-web-desktops (2,011 ★)
- https://github.com/lyoshenka/awesome-motherfucking-website (365 ★)
- Modern portfolio references cited above
