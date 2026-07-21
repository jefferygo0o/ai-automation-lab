/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
        },
        // Legacy lab palette — kept for backward compat
        paper: {
          DEFAULT: "#f5f3ee",
          50: "#fafaf7",
          100: "#f5f3ee",
          200: "#ece8df",
          300: "#d9d3c5",
        },
        ink: {
          DEFAULT: "#0d0d0c",
          900: "#0d0d0c",
          800: "#1a1a18",
          700: "#2a2a26",
          600: "#3d3d36",
          500: "#5a5a52",
          400: "#828278",
          300: "#a8a89c",
        },
        line: {
          DEFAULT: "#d9d3c5",
          soft: "#e6e1d4",
          strong: "#bcb5a4",
        },
        "accent-old": {
          DEFAULT: "#8a6a3b",
          soft: "#b89968",
          deep: "#5e4724",
        },
        ok: "#3f7a4a",
        warn: "#a8741d",
        err: "#a8412c",
        info: "#3a5a82",
      },
      fontFamily: {
        sans: ['"Inter"', "ui-sans-serif", "system-ui", "-apple-system", "Helvetica", "Arial", "sans-serif"],
        serif: ['"Source Serif 4"', '"Iowan Old Style"', '"Palatino"', "Georgia", "serif"],
        mono: ['"JetBrains Mono"', '"SF Mono"', "Menlo", "Consolas", "monospace"],
      },
      fontSize: {
        "3xs": ["9px", "12px"],
        "2xs": ["10px", "14px"],
        xs: ["11px", "16px"],
        sm: ["13px", "20px"],
        base: ["14px", "22px"],
      },
      letterSpacing: {
        tightest: "-0.02em",
        tight: "-0.01em",
        wider: "0.04em",
        widest: "0.14em",
      },
      borderRadius: {
        none: "0",
        sm: "2px",
        DEFAULT: "3px",
        md: "4px",
        lg: "6px",
      },
      boxShadow: {
        soft: "0 1px 0 rgba(13,13,12,0.04)",
        pop: "0 1px 2px rgba(13,13,12,0.06), 0 0 0 1px rgba(13,13,12,0.05)",
      },
      animation: {
        "think-dot": "think-dot 1.4s ease-in-out infinite",
      },
      keyframes: {
        "think-dot": {
          "0%, 80%, 100%": { transform: "scale(0.6)", opacity: "0.4" },
          "40%": { transform: "scale(1)", opacity: "1" },
        },
      },
    },
  },
  plugins: [],
};
