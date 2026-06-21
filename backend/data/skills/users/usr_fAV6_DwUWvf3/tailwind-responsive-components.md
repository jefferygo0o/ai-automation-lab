---
id: tailwind-responsive-components
name: Tailwind Responsive Components
description: Build beautiful, responsive UIs using Tailwind CSS utility classes — navigation, cards, forms, grids, landing pages, dashboards, and SaaS templates with dark/light mode support.
---

# Tailwind Responsive Components

Build production-ready responsive user interfaces using Tailwind CSS. Includes component patterns for landing pages, SaaS templates, dashboards, and more.

## Setup
```html
<!-- CDN (quick start) -->
<script src="https://cdn.tailwindcss.com"></script>

<!-- Or npm -->
<!-- npm install -D tailwindcss @tailwindcss/forms @tailwindcss/typography -->
```

## 1. Responsive Navigation
```html
<nav class="fixed top-0 w-full z-50 bg-navy-950/90 backdrop-blur-md border-b border-gold-900/20">
  <div class="max-w-7xl mx-auto px-6 flex items-center justify-between h-16">
    <a href="#" class="font-serif text-xl font-bold text-gold-500">Brand</a>
    
    <!-- Desktop links -->
    <ul class="hidden md:flex items-center gap-8">
      <li><a href="#" class="text-sm text-white/80 hover:text-gold-500 transition">About</a></li>
      <li><a href="#" class="text-sm text-white/80 hover:text-gold-500 transition">Services</a></li>
      <li><a href="#" class="text-sm text-white/80 hover:text-gold-500 transition">Contact</a></li>
      <li><a href="#" class="bg-gold-500 text-navy-950 px-5 py-2 text-sm font-medium hover:bg-gold-400 transition">Get Started</a></li>
    </ul>
    
    <!-- Mobile toggle -->
    <button class="md:hidden flex flex-col gap-1.5" onclick="document.getElementById('mobileMenu').classList.toggle('hidden')">
      <span class="block w-6 h-0.5 bg-white"></span>
      <span class="block w-6 h-0.5 bg-white"></span>
      <span class="block w-6 h-0.5 bg-white"></span>
    </button>
  </div>
  <!-- Mobile menu -->
  <ul id="mobileMenu" class="hidden md:hidden px-6 pb-4 space-y-3">
    <li><a href="#" class="block text-white/80 py-2">About</a></li>
    <li><a href="#" class="block text-white/80 py-2">Services</a></li>
    <li><a href="#" class="block text-white/80 py-2">Contact</a></li>
  </ul>
</nav>
```

## 2. Hero Section (SaaS / Agency)
```html
<section class="min-h-screen flex items-center bg-gradient-to-br from-navy-950 via-navy-900 to-navy-950 relative overflow-hidden">
  <div class="max-w-7xl mx-auto px-6 py-24">
    <div class="max-w-3xl">
      <span class="inline-block px-4 py-1.5 border border-gold-500/30 rounded-full text-gold-400 text-xs tracking-widest uppercase mb-8">
        ✦ Established · Trusted · London
      </span>
      <h1 class="text-5xl md:text-7xl font-serif text-white leading-tight mb-6">
        Expert Legal Counsel
        <span class="block text-gold-500 italic font-normal text-4xl md:text-5xl mt-2">When It Matters Most</span>
      </h1>
      <p class="text-lg text-white/60 max-w-xl mb-10 leading-relaxed">
        Delivering exceptional legal services with unwavering integrity. 
        Our team provides strategic counsel across all areas of British law.
      </p>
      <div class="flex flex-wrap gap-4">
        <a href="#" class="bg-gold-500 text-navy-950 px-8 py-3.5 font-medium hover:bg-gold-400 transition shadow-lg shadow-gold-500/25">Schedule a Consultation</a>
        <a href="#" class="border border-gold-500 text-white px-8 py-3.5 font-medium hover:bg-gold-500 hover:text-navy-950 transition">Our Services</a>
      </div>
    </div>
  </div>
</section>
```

## 3. Stats Bar
```html
<div class="flex gap-8 md:gap-16 mt-16 pt-8 border-t border-gold-900/20">
  <div>
    <h3 class="text-3xl font-bold text-gold-500">35+</h3>
    <p class="text-xs text-white/40 uppercase tracking-widest mt-1">Years Experience</p>
  </div>
  <div>
    <h3 class="text-3xl font-bold text-gold-500">2,500+</h3>
    <p class="text-xs text-white/40 uppercase tracking-widest mt-1">Cases Resolved</p>
  </div>
  <div>
    <h3 class="text-3xl font-bold text-gold-500">98%</h3>
    <p class="text-xs text-white/40 uppercase tracking-widest mt-1">Client Satisfaction</p>
  </div>
</div>
```

## 4. Card Grid (Practice Areas / Services)
```html
<div class="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
  <div class="bg-white p-8 rounded-lg shadow-sm border border-gray-100 hover:shadow-xl hover:-translate-y-1.5 transition-all group">
    <div class="w-12 h-12 bg-amber-50 rounded-lg flex items-center justify-center mb-5 text-2xl group-hover:scale-110 transition-transform">⚖️</div>
    <h3 class="font-serif text-lg text-navy-950 mb-3">Corporate Law</h3>
    <p class="text-gray-500 text-sm leading-relaxed">Company formation, M&A, corporate governance, and commercial contracts.</p>
  </div>
  <!-- Repeat for other services -->
</div>
```

## 5. Testimonial Cards
```html
<div class="grid md:grid-cols-3 gap-6">
  <div class="bg-white/5 border border-gold-900/20 rounded-lg p-8 hover:bg-white/10 transition">
    <div class="text-gold-500 mb-4">★★★★★</div>
    <blockquote class="text-white/80 text-sm leading-relaxed italic">
      "Outstanding legal service. They made a complex process feel seamless."
    </blockquote>
    <div class="flex items-center gap-3 mt-6 pt-5 border-t border-white/10">
      <div class="w-10 h-10 rounded-full bg-gold-500 flex items-center justify-center text-navy-950 font-bold text-sm">SR</div>
      <div>
        <strong class="text-white text-sm block">Sarah Richardson</strong>
        <span class="text-white/40 text-xs">Private Client</span>
      </div>
    </div>
  </div>
</div>
```

## 6. Contact Form
```html
<div class="max-w-2xl mx-auto space-y-5">
  <div class="grid md:grid-cols-2 gap-5">
    <input type="text" placeholder="First Name" class="w-full px-4 py-3.5 border border-gray-200 rounded-lg focus:border-gold-500 focus:ring-2 focus:ring-gold-500/20 outline-none transition">
    <input type="text" placeholder="Last Name" class="w-full px-4 py-3.5 border border-gray-200 rounded-lg focus:border-gold-500 focus:ring-2 focus:ring-gold-500/20 outline-none transition">
  </div>
  <input type="email" placeholder="Email Address" class="w-full px-4 py-3.5 border border-gray-200 rounded-lg focus:border-gold-500 focus:ring-2 focus:ring-gold-500/20 outline-none transition">
  <textarea rows="4" placeholder="Your Message" class="w-full px-4 py-3.5 border border-gray-200 rounded-lg focus:border-gold-500 focus:ring-2 focus:ring-gold-500/20 outline-none transition resize-none"></textarea>
  <button class="bg-gold-500 text-navy-950 px-8 py-3.5 font-medium hover:bg-gold-400 transition">Send Message</button>
</div>
```

## 7. Footer
```html
<footer class="bg-navy-950 border-t border-gold-900/20 py-16 px-6">
  <div class="max-w-7xl mx-auto grid md:grid-cols-2 lg:grid-cols-4 gap-10">
    <div>
      <a href="#" class="font-serif text-lg text-gold-500 font-bold">Esquire<span class="text-white font-light">Law</span> UK</a>
      <p class="text-white/40 text-sm mt-4 leading-relaxed">Distinguished legal counsel serving London since 1998.</p>
    </div>
    <div>
      <h4 class="text-gold-500 text-xs uppercase tracking-widest font-semibold mb-5">Practice Areas</h4>
      <ul class="space-y-3">
        <li><a href="#" class="text-white/50 text-sm hover:text-gold-500 transition">Corporate Law</a></li>
        <li><a href="#" class="text-white/50 text-sm hover:text-gold-500 transition">Family Law</a></li>
        <li><a href="#" class="text-white/50 text-sm hover:text-gold-500 transition">Property Law</a></li>
      </ul>
    </div>
    <div>
      <h4 class="text-gold-500 text-xs uppercase tracking-widest font-semibold mb-5">Quick Links</h4>
      <ul class="space-y-3">
        <li><a href="#" class="text-white/50 text-sm hover:text-gold-500 transition">About</a></li>
        <li><a href="#" class="text-white/50 text-sm hover:text-gold-500 transition">Contact</a></li>
        <li><a href="#" class="text-white/50 text-sm hover:text-gold-500 transition">Privacy Policy</a></li>
      </ul>
    </div>
    <div>
      <h4 class="text-gold-500 text-xs uppercase tracking-widest font-semibold mb-5">Contact</h4>
      <p class="text-white/50 text-sm">72 Chancery Lane<br>London, WC2A 1JR<br>+44 (0)20 7400 1234</p>
    </div>
  </div>
  <div class="max-w-7xl mx-auto mt-12 pt-8 border-t border-white/5 flex flex-wrap justify-between items-center gap-4">
    <p class="text-white/30 text-xs">© 2025 Esquire Law UK. All rights reserved.</p>
    <div class="flex gap-4">
      <a href="#" class="text-white/30 hover:text-gold-500 transition text-sm">LinkedIn</a>
      <a href="#" class="text-white/30 hover:text-gold-500 transition text-sm">Twitter</a>
    </div>
  </div>
</footer>
```

## 8. Tailwind Config with Custom Colors
```javascript
// tailwind.config.js
module.exports = {
  content: ['./**/*.{html,js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: {
          50: '#e8edf5', 100: '#c5d1e4', 200: '#9fb3d1',
          800: '#132240', 900: '#0d1f3c', 950: '#0a1628'
        },
        gold: {
          400: '#e8d48b', 500: '#c9a84c', 600: '#a8872e', 900: '#5a4a1a'
        }
      },
      fontFamily: {
        serif: ['Playfair Display', 'Georgia', 'serif'],
        sans: ['Inter', '-apple-system', 'sans-serif']
      }
    }
  }
};
```

## 9. Dark/Light Mode Toggle
```html
<button onclick="document.documentElement.classList.toggle('dark')" class="p-2 rounded-lg hover:bg-white/10 transition">
  <svg class="w-5 h-5 text-white/80 dark:hidden" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"/></svg>
  <svg class="w-5 h-5 text-white/80 hidden dark:block" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707"/></svg>
</button>
```

## 10. Complete Landing Page Template
Combine patterns 1-9 for a full law firm / agency / SaaS landing page.

## Resources
- [Tailwind Docs](https://tailwindcss.com/docs)
- GitHub: `pinak3748/agency-kit-site`, `rafeul19/SaaS-Landing-Page`, `syedmushtaq4033/tailwind-ui-bundle`
