---
id: tailwind-shadcn-systems
name: Tailwind & shadcn/ui Systems
description: Build professional UI systems using Tailwind CSS and shadcn/ui — component design, dark mode, responsive patterns, form systems, and full page templates for any business type.
---

# Tailwind & shadcn/ui Systems

Build professional UI systems using Tailwind CSS v4 and shadcn/ui. Covers component creation, design tokens, dark mode, responsive patterns, forms, and full page templates.

## Getting Started
```bash
npx create-next-app@latest my-app --typescript --tailwind --app
cd my-app
npx shadcn@latest init
```

## 1. Design Tokens (tailwind.config.ts)
```typescript
import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: {
          50: '#f0f2f5',
          100: '#d0d6e0',
          200: '#a1adc1',
          300: '#7284a2',
          400: '#435b83',
          500: '#0a1628',
          600: '#081220',
          700: '#060e18',
          800: '#040910',
          900: '#020508',
        },
        gold: {
          50: '#faf6ed',
          100: '#f0e8c9',
          200: '#e0d0a3',
          300: '#d0b87d',
          400: '#c0a057',
          500: '#c9a84c',
          600: '#a88a2e',
          700: '#876c10',
          800: '#654e00',
          900: '#433400',
        },
      },
      fontFamily: {
        serif: ['Playfair Display', 'Georgia', 'serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      container: {
        center: true,
        padding: '2rem',
        screens: { '2xl': '1200px' },
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};
export default config;
```

## 2. shadcn/ui Component Customization

### Button Variants
```tsx
// components/ui/button.tsx (extended)
const buttonVariants = cva(
  'inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        gold: 'bg-gold-500 text-navy-900 hover:bg-gold-600 shadow-md hover:shadow-lg',
        'gold-outline': 'border border-gold-500 text-gold-500 hover:bg-gold-50 dark:hover:bg-navy-800',
        navy: 'bg-navy-500 text-white hover:bg-navy-600',
        ghost: 'hover:bg-gold-50 hover:text-gold-600 dark:hover:bg-navy-800',
      },
      size: {
        sm: 'h-9 px-3 text-xs',
        md: 'h-11 px-6 text-sm',
        lg: 'h-13 px-8 text-base',
      },
    },
    defaultVariants: { variant: 'gold', size: 'md' },
  }
);
```

### Card Component (Professional)
```tsx
// components/custom/ProfessionalCard.tsx
interface Props {
  icon?: React.ReactNode;
  title: string;
  description: string;
  variant?: 'default' | 'testimonial' | 'feature';
}

export function ProfessionalCard({ icon, title, description, variant = 'default' }: Props) {
  return (
    <div className={cn(
      'group relative overflow-hidden rounded-lg p-8 transition-all duration-300',
      'border border-gray-100 dark:border-navy-700',
      'hover:shadow-lg hover:-translate-y-1',
      variant === 'testimonial' && 'bg-navy-500 text-white',
      variant === 'feature' && 'bg-white dark:bg-navy-800'
    )}>
      {/* Gold accent line on hover */}
      <div className="absolute top-0 left-0 right-0 h-0.5 bg-gold-500 scale-x-0 group-hover:scale-x-100 transition-transform origin-left" />
      
      {icon && <div className="mb-4 text-gold-500">{icon}</div>}
      <h3 className="font-serif text-xl font-semibold mb-3">{title}</h3>
      <p className={cn(
        'text-sm leading-relaxed',
        variant === 'testimonial' ? 'text-white/70' : 'text-gray-600 dark:text-gray-400'
      )}>{description}</p>
    </div>
  );
}
```

## 3. Dark Mode Implementation
```tsx
// components/ThemeToggle.tsx
'use client';
import { useTheme } from 'next-themes';

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  return (
    <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
      className="p-2 rounded-md hover:bg-navy-100 dark:hover:bg-navy-800 transition-colors">
      {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}
```

## 4. Responsive Navigation (shadcn + Tailwind)
```tsx
// components/Navbar.tsx
'use client';
import { useState } from 'react';
import { cn } from '@/lib/utils';

const links = [
  { href: '#about', label: 'About' },
  { href: '#services', label: 'Services' },
  { href: '#contact', label: 'Contact' },
];

export function Navbar() {
  const [open, setOpen] = useState(false);

  return (
    <nav className="fixed top-0 w-full z-50 bg-navy-500/90 backdrop-blur-md border-b border-gold-500/10">
      <div className="container flex items-center justify-between h-18">
        <a href="/" className="font-serif text-xl font-bold text-white">
          Esquire<span className="text-gold-500">Law</span> UK
        </a>
        
        {/* Desktop */}
        <div className="hidden md:flex items-center gap-8">
          {links.map(link => (
            <a key={link.href} href={link.href}
              className="text-white/70 hover:text-gold-500 transition-colors text-sm tracking-wide relative after:absolute after:bottom-0 after:left-0 after:h-px after:w-0 after:bg-gold-500 after:transition-all hover:after:w-full">
              {link.label}
            </a>
          ))}
          <a href="#consultation" className="bg-gold-500 text-navy-900 px-5 py-2.5 rounded-md text-sm font-medium hover:bg-gold-600 transition-colors">
            Book Consultation
          </a>
        </div>
        
        {/* Mobile toggle */}
        <button className="md:hidden p-2 text-white" onClick={() => setOpen(!open)}>
          {open ? <XIcon /> : <MenuIcon />}
        </button>
      </div>
      
      {/* Mobile menu */}
      {open && (
        <div className="md:hidden bg-navy-500 border-t border-gold-500/10 px-4 py-6 space-y-4">
          {links.map(link => (
            <a key={link.href} href={link.href} onClick={() => setOpen(false)}
              className="block text-white/70 hover:text-gold-500 py-2">{link.label}</a>
          ))}
        </div>
      )}
    </nav>
  );
}
```

## 5. Contact Form with shadcn/ui
```tsx
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';

export function ContactForm() {
  return (
    <form className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="firstName">First Name</Label>
          <Input id="firstName" placeholder="John" required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="lastName">Last Name</Label>
          <Input id="lastName" placeholder="Smith" required />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" type="email" placeholder="john@example.com" required />
      </div>
      <div className="space-y-2">
        <Label>Practice Area</Label>
        <Select>
          <SelectTrigger><SelectValue placeholder="Select a practice area" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="corporate">Corporate Law</SelectItem>
            <SelectItem value="family">Family Law</SelectItem>
            <SelectItem value="property">Property Law</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="message">Message</Label>
        <Textarea id="message" placeholder="Describe your enquiry..." className="min-h-[120px]" />
      </div>
      <Button type="submit" variant="gold" size="lg" className="w-full md:w-auto">
        Send Enquiry
      </Button>
    </form>
  );
}
```

## 6. Page Templates

### Hero Section (Tailwind)
```tsx
export function HeroSection() {
  return (
    <section className="relative min-h-screen flex items-center bg-navy-500 overflow-hidden">
      {/* Grid pattern overlay */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(201,168,76,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(201,168,76,0.03)_1px,transparent_1px)] bg-[size:60px_60px]" />
      
      <div className="container relative z-10">
        <div className="max-w-2xl">
          <span className="inline-block px-4 py-1.5 border border-gold-500/30 text-gold-500 text-xs uppercase tracking-[0.2em] rounded-full mb-6">
            Est. 1998 · London
          </span>
          <h1 className="font-serif text-5xl md:text-7xl font-bold text-white leading-tight mb-6">
            Expert Legal Counsel<br />
            <span className="text-gold-500 italic font-normal">with integrity</span>
          </h1>
          <p className="text-white/60 text-lg max-w-xl mb-10 leading-relaxed">
            Distinguished legal services across London and the home counties.
          </p>
          <div className="flex flex-wrap gap-4">
            <Button variant="gold" size="lg">Schedule Consultation</Button>
            <Button variant="gold-outline" size="lg">Our Services</Button>
          </div>
        </div>
      </div>
    </section>
  );
}
```

## 7. Utility Classes
```css
@layer utilities {
  .text-balance { text-wrap: balance; }
  .bg-grid-gold { 
    background-image: linear-gradient(rgba(201,168,76,0.03) 1px, transparent 1px),
      linear-gradient(90deg, rgba(201,168,76,0.03) 1px, transparent 1px);
    background-size: 60px 60px;
  }
  .animate-on-scroll {
    opacity: 0;
    transform: translateY(30px);
    transition: opacity 0.7s ease, transform 0.7s ease;
  }
  .animate-on-scroll.visible { opacity: 1; transform: translateY(0); }
}
```

## 8. Law Firm Homepage Layout
```tsx
export default function HomePage() {
  return (
    <>
      <Navbar />
      <HeroSection />
      
      <section className="py-24 bg-white dark:bg-navy-900">
        <div className="container">
          <h2 className="font-serif text-4xl text-center mb-4">Our Practice Areas</h2>
          <div className="w-16 h-0.5 bg-gold-500 mx-auto mb-16" />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {/* Practice area cards */}
          </div>
        </div>
      </section>
      
      <section className="py-24 bg-navy-500 text-white">
        <div className="container">
          <h2 className="font-serif text-4xl text-center mb-4">What Our Clients Say</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Testimonial cards */}
          </div>
        </div>
      </section>
      
      <footer className="py-16 bg-navy-500 border-t border-gold-500/10">
        <div className="container">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-12">
            {/* Footer columns */}
          </div>
        </div>
      </footer>
    </>
  );
}
```

## Resources
- [Tailwind CSS Docs](https://tailwindcss.com/docs)
- [shadcn/ui Components](https://ui.shadcn.com)
- [Next.js + shadcn Guide](https://ui.shadcn.com/docs/installation/next)
