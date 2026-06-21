---
id: website-boilerplate
name: Website Boilerplate (Vite + TailwindCSS + Vanilla JS)
description: Scaffold a production-ready modern website using Vite, TailwindCSS 4, vanilla JavaScript, ESLint, Prettier, and Husky based on doinel1a/vite-vanilla-js boilerplate.
---

# Website Boilerplate (Vite + TailwindCSS + Vanilla JS)

Scaffold a production-ready modern website using the **doinel1a/vite-vanilla-js** boilerplate.

**GitHub:** https://github.com/doinel1a/vite-vanilla-js
**Demo:** https://vite-vanilla-js.d1a.app
**Stars:** ~30 | **License:** MIT

## What You Get

- **Vite** — Fast dev server and optimized builds
- **TailwindCSS 4** — Utility-first CSS
- **Vanilla JavaScript** — No framework overhead
- **ESLint + Prettier** — Linting and formatting
- **Husky + Commitlint + Lint-Staged** — Git hooks for clean commits
- **Playwright** — E2E testing pre-configured
- **SASS/SCSS** support
- **92.3% browser coverage** (Chrome, Firefox, Edge, Opera, Safari)

## Prerequisites

- Node.js (latest LTS recommended)
- pnpm, yarn, or bun (optional — npm works too)

## Setup Steps

### 1. Clone the template

```bash
git clone https://github.com/doinel1a/vite-vanilla-js YOUR-PROJECT-NAME
cd YOUR-PROJECT-NAME
```

### 2. Choose your package manager & delete other lock files

If using **npm**: delete `pnpm-lock.yaml`, `bun.lock`, `yarn.lock`
If using **pnpm**: delete `package-lock.json`, `bun.lock`, `yarn.lock`
(etc.)

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

### 4. Start the dev server

```bash
npm run dev
# OR
pnpm dev
# OR
bun run dev
# OR
yarn dev
```

Open http://localhost:5173 (or the port shown in terminal).

### 5. Build for production

```bash
npm run build
# OR
pnpm build
# OR
bun run build
# OR
yarn build
```

Output goes to `dist/`.

### 6. Preview production build

```bash
npm run preview
```

## Project Structure

```
├── public/              # Static assets
├── src/
│   ├── scripts/         # JS files
│   ├── styles/          # SCSS/CSS files
│   └── index.html       # Entry HTML
├── tests/               # Playwright tests
├── _config.js           # Site config
├── vite.config.js       # Vite configuration
├── tailwind.config.js   # Tailwind config
└── package.json
```

## Customization

- **Site metadata** — Edit `_config.js` for site name, description, URL
- **Styling** — Edit Tailwind classes or add custom CSS in `src/styles/`
- **Scripts** — Add your JS in `src/scripts/`
- **Colors** — Configure via `tailwind.config.js`

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Lock file conflicts | Keep only ONE lock file matching your package manager |
| Port in use | Vite auto-picks next available port — check terminal output |
| Tailwind classes not applying | Ensure `@tailwind` directives are in your CSS entry point |
| ESLint errors | Run `npm run lint` to check — auto-fix with `npm run lint:fix` |
