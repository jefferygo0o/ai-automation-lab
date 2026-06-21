---
id: modern-css-architecture
name: Modern CSS Architecture
description: Master modern CSS: custom properties, container queries, CSS grid layouts, animations, responsive patterns, and design systems for production websites.
---

# Modern CSS Architecture

Master production-grade CSS: custom properties, container queries, advanced grid layouts, responsive typography, animations, and design system architecture.

## 1. Design System with Custom Properties
```css
:root {
  /* Colors */
  --color-navy: #0a1628;
  --color-navy-light: #132240;
  --color-gold: #c9a84c;
  --color-gold-dark: #a88a2e;
  --color-cream: #f5f0e8;
  --color-white: #ffffff;
  --color-text: #2d2d2d;
  --color-text-light: #6b7280;
  
  /* Typography */
  --font-serif: 'Playfair Display', Georgia, serif;
  --font-sans: 'Inter', system-ui, -apple-system, sans-serif;
  --font-size-xs: 0.75rem;
  --font-size-sm: 0.875rem;
  --font-size-base: 1rem;
  --font-size-lg: 1.125rem;
  --font-size-xl: 1.25rem;
  --font-size-2xl: 1.5rem;
  --font-size-3xl: 2rem;
  --font-size-4xl: 2.5rem;
  --font-size-5xl: 3.5rem;
  
  /* Spacing */
  --space-1: 0.25rem;
  --space-2: 0.5rem;
  --space-4: 1rem;
  --space-6: 1.5rem;
  --space-8: 2rem;
  --space-12: 3rem;
  --space-16: 4rem;
  --space-20: 5rem;
  --space-24: 6rem;
  
  /* Layout */
  --max-width: 1200px;
  --content-padding: 2rem;
  --grid-gap: 2rem;
  
  /* Effects */
  --shadow-sm: 0 1px 3px rgba(10,22,40,0.08);
  --shadow-md: 0 4px 24px rgba(10,22,40,0.08);
  --shadow-lg: 0 12px 40px rgba(10,22,40,0.12);
  --radius-sm: 4px;
  --radius-md: 8px;
  --radius-lg: 12px;
}
```

## 2. Responsive Typography (Clamp)
```css
h1 { font-size: clamp(2rem, 5vw, 3.5rem); line-height: 1.1; }
h2 { font-size: clamp(1.5rem, 3vw, 2.5rem); line-height: 1.2; }
h3 { font-size: clamp(1.2rem, 1.8vw, 1.75rem); line-height: 1.3; }
body { font-size: clamp(1rem, 1.1vw, 1.125rem); line-height: 1.6; }
```

## 3. Container Queries (Modern Responsive)
```css
.card-container { container-type: inline-size; }

@container (min-width: 400px) {
  .card { display: grid; grid-template-columns: 200px 1fr; gap: 1.5rem; }
}
@container (max-width: 399px) {
  .card { display: flex; flex-direction: column; }
}
```

## 4. Advanced CSS Grid Patterns
```css
/* Auto-fit grid with minmax */
.grid-auto {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: var(--grid-gap);
}

/* Holy Grail layout */
.holy-grail {
  display: grid;
  grid-template-areas:
    "header header header"
    "nav    main   aside"
    "footer footer footer";
  grid-template-columns: 250px 1fr 250px;
  grid-template-rows: auto 1fr auto;
  min-height: 100vh;
}

/* Masonry (CSS only) */
.masonry {
  columns: 3;
  column-gap: 1.5rem;
}
.masonry > * {
  break-inside: avoid;
  margin-bottom: 1.5rem;
}
```

## 5. Responsive Navigation Pattern
```css
.nav { display: flex; align-items: center; justify-content: space-between; }
.nav-links { display: flex; gap: 2rem; list-style: none; }

/* Mobile hamburger */
@media (max-width: 768px) {
  .nav-links {
    position: fixed;
    top: 72px; left: 0; right: 0;
    background: rgba(10,22,40,0.98);
    flex-direction: column;
    padding: 2rem;
    transform: translateY(-120%);
    transition: transform 0.4s ease;
  }
  .nav-links.open { transform: translateY(0); }
  .nav-toggle { display: flex; }
}
```

## 6. CSS-Only Animations
```css
/* Fade-in on scroll (Intersection Observer with CSS) */
.fade-in {
  opacity: 0;
  transform: translateY(30px);
  transition: opacity 0.7s ease, transform 0.7s ease;
}
.fade-in.visible { opacity: 1; transform: translateY(0); }

/* Stagger delays */
.fade-in:nth-child(1) { transition-delay: 0s; }
.fade-in:nth-child(2) { transition-delay: 0.1s; }
.fade-in:nth-child(3) { transition-delay: 0.2s; }

/* Smooth underline hover */
.nav-link {
  position: relative;
  text-decoration: none;
}
.nav-link::after {
  content: '';
  position: absolute;
  bottom: -4px; left: 0;
  width: 0; height: 2px;
  background: var(--color-gold);
  transition: width 0.3s ease;
}
.nav-link:hover::after { width: 100%; }

/* Keyframe animations */
@keyframes shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}
.shimmer {
  background: linear-gradient(90deg, transparent, rgba(201,168,76,0.1), transparent);
  background-size: 200% 100%;
  animation: shimmer 2s infinite;
}
```

## 7. Glassmorphism & Modern Effects
```css
.glass {
  background: rgba(10, 22, 40, 0.8);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(201, 168, 76, 0.15);
}

.gradient-text {
  background: linear-gradient(135deg, var(--color-gold), var(--color-gold-dark));
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}
```

## 8. Grid Patterns for Law Firms & Agencies

### Practice Areas Grid
```css
.practice-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 2rem;
}
@media (max-width: 992px) { .practice-grid { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 576px) { .practice-grid { grid-template-columns: 1fr; } }
```

### Two-Column Content
```css
.content-split {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4rem;
  align-items: center;
}
@media (max-width: 768px) { .content-split { grid-template-columns: 1fr; gap: 2rem; } }
```

## 9. Accessibility & Reduced Motion
```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}

/* Focus styles */
:focus-visible {
  outline: 2px solid var(--color-gold);
  outline-offset: 2px;
}

/* Screen reader only */
.sr-only {
  position: absolute;
  width: 1px; height: 1px;
  padding: 0; margin: -1px;
  overflow: hidden; clip: rect(0,0,0,0);
  border: 0;
}
```

## 10. Performance Best Practices
- Use `content-visibility: auto` for below-fold sections
- Implement `contain: layout style` on isolated components
- Use subgrid for aligned nested layouts
- Prefer `transform` and `opacity` for animations (GPU-accelerated)
- Avoid `box-shadow` animations (paint-heavy)

## Resources
- [MDN CSS Grid](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_Grid_Layout)
- [Container Queries Guide](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_containment/Container_queries)
- [CSS Custom Properties](https://developer.mozilla.org/en-US/docs/Web/CSS/Using_CSS_custom_properties)
- [clamp() Calculator](https://clampcalculator.com/)
