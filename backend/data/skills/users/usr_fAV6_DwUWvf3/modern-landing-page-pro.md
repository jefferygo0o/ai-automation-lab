---
id: modern-landing-page-pro
name: Modern Landing Page Pro
description: Build complete, production-ready landing pages with Next.js 15 App Router, TypeScript, shadcn/ui components, Tailwind CSS, SEO metadata, MDX blog, dark/light mode, and GSAP animations — perfect for agencies, SaaS, and law firms.
---

# Modern Landing Page Pro

Build complete, production-ready landing pages using the Next.js 15 App Router stack with shadcn/ui, TypeScript, Tailwind CSS, GSAP animations, MDX blog, and full SEO optimization.

## Tech Stack
```bash
npx create-next-app@latest my-site --typescript --tailwind --app
cd my-site
npm install @radix-ui/react-slot @radix-ui/react-dialog @radix-ui/react-dropdown-menu class-variance-authority clsx tailwind-merge lucide-react
npx shadcn@latest init
npm install gsap @types/gsap
```

## 1. Project Structure
```
app/
├── layout.tsx          # Root layout with fonts, metadata, nav
├── page.tsx            # Homepage (hero + sections)
├── about/page.tsx      # About page
├── blog/
│   ├── page.tsx        # Blog index
│   └── [slug]/page.tsx # Blog post
├── globals.css         # Global styles + tailwind
├── lib/
│   ├── metadata.ts     # SEO metadata config
│   └── utils.ts        # cn() helper
├── components/
│   ├── ui/             # shadcn/ui components
│   ├── landing/        # Homepage sections
│   └── custom/         # Custom components
├── content/            # MDX blog posts
└── hooks/              # Custom hooks
```

## 2. Root Layout with SEO
```tsx
// app/layout.tsx
import type { Metadata } from 'next';
import { Inter, Playfair_Display } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
const playfair = Playfair_Display({ subsets: ['latin'], variable: '--font-playfair' });

export const metadata: Metadata = {
  title: { default: 'Esquire Law UK', template: '%s | Esquire Law UK' },
  description: 'Expert legal counsel with integrity. Serving London since 1998.',
  openGraph: {
    title: 'Esquire Law UK — Distinguished Legal Counsel',
    description: 'Expert legal services across London and the UK.',
    type: 'website',
  }
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} ${playfair.variable} font-sans bg-white dark:bg-navy-950 text-gray-900 dark:text-white`}>
        {children}
      </body>
    </html>
  );
}
```

## 3. Tailwind Config with Custom Theme
```ts
// tailwind.config.ts
import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: { 50: '#e8edf5', 950: '#0a1628', 900: '#132240' },
        gold: { 400: '#e8d48b', 500: '#c9a84c', 600: '#a8872e' },
        cream: '#f5f0e8',
      },
      fontFamily: {
        serif: ['var(--font-playfair)', 'Georgia', 'serif'],
        sans: ['var(--font-inter)', '-apple-system', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
export default config;
```

## 4. shadcn/ui Button Component
```tsx
// components/ui/button.tsx
import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium transition-all duration-300 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-gold-500 text-navy-950 hover:bg-gold-600 shadow-lg shadow-gold-500/25',
        outline: 'border border-gold-500 text-gold-500 hover:bg-gold-500 hover:text-navy-950',
        ghost: 'text-white/80 hover:text-gold-500 hover:bg-white/5',
      },
      size: {
        default: 'h-12 px-8',
        sm: 'h-10 px-5',
        lg: 'h-14 px-10 text-base',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  }
);
```

## 5. Hero Section Component
```tsx
// components/landing/hero.tsx
'use client';
import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { Button } from '@/components/ui/button';

export function Hero() {
  const heroRef = useRef(null);
  
  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger);
    const ctx = gsap.context(() => {
      gsap.from('.hero-title', { opacity: 0, y: 60, duration: 1, ease: 'power3.out' });
      gsap.from('.hero-subtitle', { opacity: 0, y: 40, duration: 1, delay: 0.3, ease: 'power3.out' });
      gsap.from('.hero-buttons', { opacity: 0, y: 30, duration: 0.8, delay: 0.6, ease: 'power3.out' });
    }, heroRef);
    return () => ctx.revert();
  }, []);

  return (
    <section ref={heroRef} className="relative min-h-screen flex items-center bg-gradient-to-br from-navy-950 via-navy-900 to-navy-950 overflow-hidden">
      <div className="absolute inset-0 bg-[linear-gradient(rgba(201,168,76,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(201,168,76,0.03)_1px,transparent_1px)] bg-[length:60px_60px] pointer-events-none" />
      <div className="container mx-auto px-6 relative z-10">
        <div className="max-w-3xl">
          <span className="inline-block px-4 py-1.5 border border-gold-500/30 rounded-full text-gold-400 text-xs tracking-[0.2em] uppercase mb-8">
            Established · Trusted · London
          </span>
          <h1 className="hero-title font-serif text-5xl md:text-7xl text-white leading-tight mb-6">
            Expert Legal Counsel
            <span className="block text-gold-500 italic text-4xl md:text-5xl mt-2">When It Matters Most</span>
          </h1>
          <p className="hero-subtitle text-lg text-white/60 max-w-xl mb-10 leading-relaxed">
            Esquire Law UK delivers exceptional legal services with unwavering integrity.
            Our team of seasoned solicitors provides strategic counsel across all areas of British law.
          </p>
          <div className="hero-buttons flex flex-wrap gap-4">
            <Button variant="default" size="lg" asChild>
              <a href="#contact">Schedule a Consultation</a>
            </Button>
            <Button variant="outline" size="lg" asChild>
              <a href="#practice">Our Services</a>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
```

## 6. Stats Bar Component
```tsx
// components/landing/stats.tsx
'use client';
import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

const stats = [
  { value: 35, suffix: '+', label: 'Years Combined Experience' },
  { value: 2500, suffix: '+', label: 'Matters Resolved' },
  { value: 98, suffix: '%', label: 'Client Satisfaction Rate' },
];

export function Stats() {
  const ref = useRef(null);
  
  useEffect(() => {
    const ctx = gsap.context(() => {
      stats.forEach((_, i) => {
        gsap.from(`.stat-${i}`, {
          scrollTrigger: { trigger: ref.current, start: 'top 80%' },
          innerText: 0,
          duration: 2,
          ease: 'power2.out',
          snap: { innerText: 1 },
        });
      });
    }, ref);
    return () => ctx.revert();
  }, []);

  return (
    <div ref={ref} className="flex gap-12 mt-16 pt-8 border-t border-gold-900/20">
      {stats.map((stat, i) => (
        <div key={i}>
          <h3 className={`stat-${i} text-3xl font-bold text-gold-500`}>{stat.value}{stat.suffix}</h3>
          <p className="text-xs text-white/40 uppercase tracking-widest mt-1">{stat.label}</p>
        </div>
      ))}
    </div>
  );
}
```

## 7. Blog with MDX
```tsx
// app/blog/[slug]/page.tsx
import { MDXRemote } from 'next-mdx-remote/rsc';
import { getPostBySlug, getPosts } from '@/lib/posts';

export async function generateStaticParams() {
  const posts = await getPosts();
  return posts.map(post => ({ slug: post.slug }));
}

export default async function BlogPost({ params }: { params: { slug: string } }) {
  const post = await getPostBySlug(params.slug);
  return (
    <article className="max-w-3xl mx-auto px-6 py-24">
      <h1 className="font-serif text-4xl mb-6">{post.meta.title}</h1>
      <MDXRemote source={post.content} />
    </article>
  );
}
```

## 8. Theme Provider
```tsx
// components/theme-provider.tsx
'use client';
import { createContext, useContext, useEffect, useState } from 'react';

const ThemeContext = createContext({ theme: 'light', toggle: () => {} });

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  
  useEffect(() => {
    const stored = localStorage.getItem('theme') as 'light' | 'dark' | null;
    if (stored) setTheme(stored);
  }, []);
  
  const toggle = () => {
    const next = theme === 'light' ? 'dark' : 'light';
    setTheme(next);
    localStorage.setItem('theme', next);
    document.documentElement.classList.toggle('dark', next === 'dark');
  };
  
  return <ThemeContext.Provider value={{ theme, toggle }}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);
```

## 9. SEO Metadata Helpers
```ts
// lib/metadata.ts
import type { Metadata } from 'next';

interface SEOProps {
  title: string;
  description: string;
  path: string;
}

export function constructMetadata({ title, description, path }: SEOProps): Metadata {
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: `https://esquirelawuk.co.uk${path}`,
      siteName: 'Esquire Law UK',
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
    },
    alternates: { canonical: `/` },
  };
}
```

## 10. Performance Optimization
```tsx
// Use next/image for images
import Image from 'next/image';

// Dynamic imports for heavy components
const HeavyComponent = dynamic(() => import('@/components/Heavy'), {
  loading: () => <Skeleton />,
});
```

## Resources
- GitHub: `pinak3748/agency-kit-site`, `Hridoy-Ahmed163/Modern-portfolio-template-with-React`
- [Next.js Docs](https://nextjs.org/docs)
- [shadcn/ui](https://ui.shadcn.com)
- [MDX](https://mdxjs.com)
