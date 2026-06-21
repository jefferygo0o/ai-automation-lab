---
id: website-design-patterns
name: Website Design Patterns
description: Modern, responsive website design patterns — hero layouts, navigation patterns, grid systems, card components, contact forms, footers, and complete page templates using HTML/CSS/JS, Tailwind, or shadcn/ui.
---

# Website Design Patterns

A comprehensive collection of modern, production-ready website design patterns. These cover everything from navigation to complex layouts, built with vanilla CSS, Tailwind CSS, and shadcn/ui.

## 1. Navigation Patterns

### Sticky Glassmorphism Nav
```html
<nav style="position:fixed;top:0;width:100%;z-index:1000;
  background:rgba(10,22,40,0.92);backdrop-filter:blur(12px);
  border-bottom:1px solid rgba(201,168,76,0.15);">
  <div class="container" style="display:flex;justify-content:space-between;align-items:center;height:70px;">
    <a href="#" class="logo" style="font-family:'Playfair Display',serif;font-size:1.4rem;color:#c9a84c;text-decoration:none;">LOGO</a>
    <ul class="nav-links" style="display:flex;gap:2rem;list-style:none;">
      <li><a href="#" style="color:rgba(255,255,255,0.8);text-decoration:none;">About</a></li>
      <li><a href="#" style="color:rgba(255,255,255,0.8);text-decoration:none;">Services</a></li>
      <li><a href="#" style="color:rgba(255,255,255,0.8);text-decoration:none;">Contact</a></li>
    </ul>
  </div>
</nav>
```

### Mobile Hamburger Menu
```css
.mobile-toggle { display:none; flex-direction:column; gap:5px; cursor:pointer; background:none; border:none; }
.mobile-toggle span { display:block; width:28px; height:2px; background:#c9a84c; transition:0.3s; }
@media(max-width:768px) {
  .mobile-toggle { display:flex; }
  .nav-links { position:fixed; top:70px; left:0; right:0; background:rgba(10,22,40,0.98);
    flex-direction:column; padding:2rem; transform:translateY(-120%); transition:0.4s; }
  .nav-links.open { transform:translateY(0); }
}
```

## 2. Hero Section Patterns

### Full-Screen Gradient Hero
```css
.hero {
  min-height:100vh; display:flex; align-items:center;
  background:linear-gradient(135deg, #0a1628 0%, #132240 50%, #0d1f3c 100%);
  position:relative; overflow:hidden;
}
.hero::before {
  content:''; position:absolute; inset:0;
  background: radial-gradient(ellipse at 20% 50%, rgba(201,168,76,0.08) 0%, transparent 50%);
  pointer-events:none;
}
.hero-content { max-width:750px; position:relative; z-index:2; }
.hero h1 { font-size:clamp(2.5rem,6vw,4rem); color:#fff; }
.hero h1 .accent { display:block; color:#c9a84c; font-style:italic; }
```

### Split Hero (Image + Text)
```css
.hero-split { display:grid; grid-template-columns:1fr 1fr; min-height:100vh; }
.hero-text { display:flex; align-items:center; padding:4rem; }
.hero-image { background:linear-gradient(135deg, #0a1628, #132240); display:flex; align-items:center; justify-content:center; }
@media(max-width:768px) { .hero-split { grid-template-columns:1fr; } }
```

## 3. Grid Layouts

### Responsive Auto-Fit Grid
```css
.grid-auto {
  display:grid;
  grid-template-columns:repeat(auto-fit, minmax(300px, 1fr));
  gap:2rem;
}
```

### 3-Column Fixed Grid
```css
.grid-3 { display:grid; grid-template-columns:repeat(3, 1fr); gap:2rem; }
@media(max-width:992px) { .grid-3 { grid-template-columns:repeat(2, 1fr); } }
@media(max-width:576px) { .grid-3 { grid-template-columns:1fr; } }
```

## 4. Card Component Patterns

### Hover Card with Gold Accent
```css
.card {
  background:#fff; padding:2.5rem 2rem;
  border:1px solid rgba(201,168,76,0.1);
  transition:all 0.4s ease; position:relative; overflow:hidden;
}
.card::before {
  content:''; position:absolute; top:0; left:0; width:3px; height:0;
  background:#c9a84c; transition:height 0.4s;
}
.card:hover::before { height:100%; }
.card:hover { transform:translateY(-6px); box-shadow:0 20px 50px rgba(10,22,40,0.1); }
.card-icon { width:50px; height:50px; background:#f5f0e8; display:flex; align-items:center; justify-content:center; margin-bottom:1.5rem; }
```

### Testimonial Card
```css
.testimonial-card {
  background:#fff; padding:2.5rem 2rem;
  border:1px solid rgba(201,168,76,0.1); position:relative;
}
.testimonial-card::before {
  content:'"'; font-family:Georgia,serif; font-size:4rem;
  color:#c9a84c; opacity:0.3; position:absolute; top:1rem; right:1.5rem;
}
.testimonial-author { display:flex; align-items:center; gap:1rem; margin-top:1.5rem; }
.testimonial-avatar { width:50px; height:50px; border-radius:50%;
  background:linear-gradient(135deg,#0a1628,#132240);
  display:flex; align-items:center; justify-content:center; color:#c9a84c; }
```

## 5. Contact Section Patterns

### Two-Column Contact
```css
.contact-grid { display:grid; grid-template-columns:1fr 1.3fr; gap:4rem; }
.contact-detail { display:flex; gap:1.2rem; margin-bottom:1.5rem; }
.contact-icon { width:45px; height:45px; background:#f5f0e8; display:flex; align-items:center; justify-content:center; }
.form-group { display:flex; flex-direction:column; gap:0.4rem; }
.form-group input, .form-group textarea {
  padding:0.85rem 1rem; border:1px solid #e5e7eb;
  font-family:'Inter',sans-serif; transition:border-color 0.3s;
}
.form-group input:focus, .form-group textarea:focus {
  outline:none; border-color:#c9a84c; box-shadow:0 0 0 3px rgba(201,168,76,0.1);
}
@media(max-width:768px) { .contact-grid { grid-template-columns:1fr; } }
```

## 6. Footer Pattern
```css
.footer-grid { display:grid; grid-template-columns:2fr 1fr 1fr 1fr; gap:3rem; }
.footer-col h4 { color:#c9a84c; font-size:0.8rem; text-transform:uppercase; letter-spacing:2px; margin-bottom:1.25rem; }
.footer-col a { display:block; color:rgba(255,255,255,0.5); text-decoration:none; font-size:0.88rem; padding:0.3rem 0; transition:color 0.3s; }
.footer-col a:hover { color:#c9a84c; }
@media(max-width:768px) { .footer-grid { grid-template-columns:1fr 1fr; } }
@media(max-width:480px) { .footer-grid { grid-template-columns:1fr; } }
```

## 7. Typography Scale (Law Firm / Professional)
```css
:root {
  --display: 'Playfair Display', Georgia, serif;
  --body: 'Inter', -apple-system, sans-serif;
  --gold: #c9a84c;
  --navy: #0a1628;
}
h1 { font-family:var(--display); font-size:clamp(2.2rem,5vw,4rem); font-weight:700; }
h2 { font-family:var(--display); font-size:clamp(1.8rem,3.5vw,2.8rem); }
h3 { font-family:var(--display); font-size:clamp(1.2rem,2vw,1.6rem); }
.body-text { font-family:var(--body); font-weight:300; color:#6b7280; line-height:1.7; }
.section-label { font-family:var(--body); font-size:0.75rem; letter-spacing:3px; text-transform:uppercase; color:var(--gold); }
```

## 8. Animation Patterns
```css
/* Scroll-triggered fade-in */
.fade-in { opacity:0; transform:translateY(30px); transition:opacity 0.7s ease, transform 0.7s ease; }
.fade-in.visible { opacity:1; transform:translateY(0); }
.delay-1 { transition-delay:0.1s; }
.delay-2 { transition-delay:0.2s; }
.delay-3 { transition-delay:0.3s; }
```
```javascript
const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) entry.target.classList.add('visible');
  });
}, { threshold: 0.15, rootMargin: '0px 0px -50px 0px' });
document.querySelectorAll('.fade-in').forEach(el => observer.observe(el));
```

## 9. CTA Banner Pattern
```css
.cta-banner {
  background:linear-gradient(135deg, #0a1628 0%, #132240 100%);
  padding:5rem 0; text-align:center; position:relative; overflow:hidden;
}
.cta-banner::before {
  content:''; position:absolute; inset:0;
  background:radial-gradient(ellipse at center, rgba(201,168,76,0.06) 0%, transparent 70%);
}
.cta-banner .container { position:relative; z-index:1; }
.cta-banner h2 { color:#fff; margin-bottom:1rem; }
.cta-banner p { color:rgba(255,255,255,0.6); max-width:550px; margin:0 auto 2rem; }
```

## 10. Buttons System
```css
.btn { display:inline-flex; align-items:center; gap:0.5rem; padding:0.9rem 2.2rem;
  font-family:'Inter',sans-serif; font-size:0.9rem; font-weight:500;
  text-decoration:none; cursor:pointer; transition:all 0.3s; border:none; }
.btn-primary { background:#c9a84c; color:#0a1628; }
.btn-primary:hover { background:#a8872e; transform:translateY(-2px); box-shadow:0 8px 25px rgba(201,168,76,0.3); }
.btn-outline { background:transparent; color:#fff; border:1px solid #c9a84c; }
.btn-outline:hover { background:#c9a84c; color:#0a1628; }
```

## Complete Page Template (Law Firm / Agency)
Combine patterns 1-10 into a single page:
- Sticky glass nav → Full-screen hero → About split grid → 3-col practice cards → Testimonials → CTA → Contact 2-col → 4-col footer

## Resources
- GitHub: `pinak3748/agency-kit-site`, `ayse-hatun/Sample-Portfolio-Ayesha-Rasheed-Design`
- [Tailwind CSS Docs](https://tailwindcss.com/docs)
- [shadcn/ui](https://ui.shadcn.com)
