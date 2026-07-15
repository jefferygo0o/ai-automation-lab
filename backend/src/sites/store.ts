import { db } from "../db/index.ts";
import { nanoid } from "nanoid";
import { mkdirSync, existsSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { WorkspaceService } from "../workspace/index.ts";

const WORKSPACE_ROOT = WorkspaceService.root();
const SITES_DIR = WorkspaceService.sitesRoot();

export interface Site {
  id: string;
  ownerId: string;
  name: string;
  slug: string;
  description: string;
  variant: string;
  rootDir: string;
  devPort: number | null;
  devStatus: string;
  publishedServiceId: string | null;
  isPublic: boolean;
  createdAt: number;
  updatedAt: number;
}

interface SiteRow {
  id: string;
  owner_id: string;
  name: string;
  slug: string;
  description: string;
  variant: string;
  root_dir: string;
  dev_port: number | null;
  dev_status: string;
  published_service_id: string | null;
  is_public: number;
  created_at: number;
  updated_at: number;
}

function rowToSite(r: SiteRow): Site {
  return {
    id: r.id,
    ownerId: r.owner_id,
    name: r.name,
    slug: r.slug,
    description: r.description,
    variant: r.variant,
    rootDir: r.root_dir,
    devPort: r.dev_port,
    devStatus: r.dev_status,
    publishedServiceId: r.published_service_id,
    isPublic: r.is_public === 1,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "site";
}

export const SiteStore = {
  async list(ownerId: string): Promise<Site[]> {
    const rows = await db
      .prepare("SELECT * FROM sites WHERE owner_id = ? ORDER BY updated_at DESC")
      .all(ownerId);
    return rows.map(rowToSite);
  },

  async get(id: string, ownerId: string): Promise<Site | null> {
    const row = await db
      .prepare("SELECT * FROM sites WHERE id = ? AND owner_id = ?")
      .get(id, ownerId) as SiteRow | undefined;
    return row ? rowToSite(row) : null;
  },

  async getBySlug(slug: string): Promise<Site | null> {
    const row = await db
      .prepare("SELECT * FROM sites WHERE slug = ?")
      .get(slug) as SiteRow | undefined;
    return row ? rowToSite(row) : null;
  },

  async create(
    ownerId: string,
    name: string,
    variant: string = "blank",
    parentPathParts: string[] = [],
  ): Promise<Site> {
    const id = `site_${nanoid(10)}`;
    let slug = slugify(name);
    // De-duplicate slug
    let suffix = 0;
    while (await SiteStore.getBySlug(slug)) {
      suffix++;
      slug = `${slugify(name)}-${suffix}`;
    }
    const now = Date.now();
    const rootDir = parentPathParts.length > 0
      ? join(SITES_DIR, ...parentPathParts, slug)
      : join(SITES_DIR, slug);

    // Create directory + zosite.json
    mkdirSync(rootDir, { recursive: true });
    const zosite = {
      name,
      variant,
      slug,
      createdAt: now,
      updatedAt: now,
    };
    writeFileSync(join(rootDir, "zosite.json"), JSON.stringify(zosite, null, 2), "utf8");

    // Scaffold from template
    SiteStore.scaffold(rootDir, variant, name);

    await db.prepare(
      `INSERT INTO sites (id, owner_id, name, slug, description, variant, root_dir, dev_port, dev_status, published_service_id, is_public, created_at, updated_at)
       VALUES (?, ?, ?, ?, '', ?, ?, NULL, 'idle', NULL, 0, ?, ?)`
    ).run(id, ownerId, name, slug, variant, rootDir, now, now);

    return (await SiteStore.get(id, ownerId))!;
  },

  async update(id: string, ownerId: string, fields: Partial<{ name: string; description: string; isPublic: boolean; devStatus: string; devPort: number | null; publishedServiceId: string | null }>): Promise<Site | null> {
    const existing = await SiteStore.get(id, ownerId);
    if (!existing) return null;
    const sets: string[] = [];
    const vals: any[] = [];
    if (fields.name !== undefined) { sets.push("name = ?"); vals.push(fields.name); }
    if (fields.description !== undefined) { sets.push("description = ?"); vals.push(fields.description); }
    if (fields.isPublic !== undefined) { sets.push("is_public = ?"); vals.push(fields.isPublic ? 1 : 0); }
    if (fields.devStatus !== undefined) { sets.push("dev_status = ?"); vals.push(fields.devStatus); }
    if (fields.devPort !== undefined) { sets.push("dev_port = ?"); vals.push(fields.devPort); }
    if (fields.publishedServiceId !== undefined) { sets.push("published_service_id = ?"); vals.push(fields.publishedServiceId); }
    if (sets.length === 0) return existing;
    sets.push("updated_at = ?");
    vals.push(Date.now(), id, ownerId);
    await db.prepare(`UPDATE sites SET ${sets.join(", ")} WHERE id = ? AND owner_id = ?`).run(...vals);
    // Keep zosite.json in sync
    if (fields.name !== undefined) {
      const zositePath = join(existing.rootDir, "zosite.json");
      try {
        const z = JSON.parse(readFileSync(zositePath, "utf8"));
        z.name = fields.name;
        z.updatedAt = Date.now();
        writeFileSync(zositePath, JSON.stringify(z, null, 2), "utf8");
      } catch {}
    }
    return SiteStore.get(id, ownerId);
  },

  async delete(id: string, ownerId: string): Promise<boolean> {
    const site = await SiteStore.get(id, ownerId);
    if (!site) return false;
    // Remove files (careful — only under SITES_DIR)
    if (site.rootDir.startsWith(SITES_DIR)) {
      try { rmSync(site.rootDir, { recursive: true, force: true }); } catch {}
    }
    const r = await db.prepare("DELETE FROM sites WHERE id = ? AND owner_id = ?").run(id, ownerId);
    return r.changes > 0;
  },

  /** Scaffold a new site from a built-in template. */
  scaffold(rootDir: string, variant: string, name: string) {
    mkdirSync(join(rootDir, "src"), { recursive: true });
    mkdirSync(join(rootDir, "public"), { recursive: true });

    // index.html — minimal SPA shell
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${name}</title>
  <link rel="stylesheet" href="/src/index.css" />
</head>
<body>
  <div id="root"></div>
  <script type="module" src="/src/main.tsx"></script>
</body>
</html>`;
    writeFileSync(join(rootDir, "index.html"), html, "utf8");

    // package.json
    const pkg = {
      name: name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      private: true,
      version: "0.0.1",
      type: "module",
      scripts: {
        dev: "bun --hot src/main.tsx",
        build: "bun run vite build",
        preview: "bun run vite preview",
      },
      dependencies: {
        react: "^19.0.0",
        "react-dom": "^19.0.0",
      },
      devDependencies: {
        vite: "^6",
        "@vitejs/plugin-react": "^4",
        typescript: "^5",
        "@types/react": "^19",
        "@types/react-dom": "^19",
      },
    };
    writeFileSync(join(rootDir, "package.json"), JSON.stringify(pkg, null, 2), "utf8");

    // tsconfig.json
    const tsconfig = {
      compilerOptions: { target: "ES2020", module: "ESNext", moduleResolution: "bundler", jsx: "react-jsx", strict: true },
      include: ["src"],
    };
    writeFileSync(join(rootDir, "tsconfig.json"), JSON.stringify(tsconfig, null, 2), "utf8");

    // vite.config.ts
    const viteConfig = `import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({ plugins: [react()] });\n`;
    writeFileSync(join(rootDir, "vite.config.ts"), viteConfig, "utf8");

    // src/main.tsx
    const main = `import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
createRoot(document.getElementById("root")!).render(<App />);\n`;
    writeFileSync(join(rootDir, "src", "main.tsx"), main, "utf8");

    // src/App.tsx — variant-aware starter
    const appVariants: Record<string, string> = {
      blank: `export default function App() {
  return <div className="min-h-screen bg-white text-gray-900 flex items-center justify-center">
    <h1 className="text-3xl font-bold">${name}</h1>
  </div>;
}\n`,
      blog: `export default function App() {
  return <div className="max-w-2xl mx-auto py-12 px-4">
    <h1 className="text-4xl font-bold mb-8">${name}</h1>
    <article className="prose"><p>Welcome to the blog.</p></article>
  </div>;
}\n`,
      marketing: `export default function App() {
  return <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-white">
    <header className="py-6 px-8"><h1 className="text-2xl font-bold text-indigo-700">${name}</h1></header>
    <main className="flex flex-col items-center justify-center py-24 px-4">
      <h2 className="text-5xl font-bold mb-4 text-center">Build something amazing</h2>
      <p className="text-lg text-gray-600 mb-8 text-center max-w-lg">Your product description goes here.</p>
      <button className="bg-indigo-600 text-white px-6 py-3 rounded-lg font-medium">Get Started</button>
    </main>
  </div>;
}\n`,
      event: `export default function App() {
  return <div className="max-w-3xl mx-auto py-16 px-4 text-center">
    <h1 className="text-5xl font-bold mb-4">${name}</h1>
    <p className="text-xl text-gray-500 mb-8">Coming soon — stay tuned.</p>
    <button className="bg-black text-white px-6 py-3 rounded-lg">Register Interest</button>
  </div>;
}\n`,
      slides: `export default function App() {
  return <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
    <div className="text-center"><h1 className="text-6xl font-bold mb-6">${name}</h1>
    <p className="text-xl text-gray-400">Presentation deck — coming soon.</p></div>
  </div>;
}\n`,
      data: `export default function App() {
  return <div className="max-w-5xl mx-auto py-8 px-4">
    <h1 className="text-3xl font-bold mb-6">${name}</h1>
    <div className="bg-white rounded-lg border p-6"><p>Data dashboard placeholder.</p></div>
  </div>;
}\n`,
    };
    writeFileSync(join(rootDir, "src", "App.tsx"), appVariants[variant] || appVariants.blank, "utf8");

    // src/index.css
    const css = `@tailwind base;
@tailwind components;
@tailwind utilities;\n`;
    writeFileSync(join(rootDir, "src", "index.css"), css, "utf8");

    // tailwind.config.js
    const twConfig = `/** @type {import('tailwindcss').Config} */
export default { content: ["./index.html", "./src/**/*.{ts,tsx}"], theme: { extend: {} }, plugins: [] };\n`;
    writeFileSync(join(rootDir, "tailwind.config.js"), twConfig, "utf8");

    // postcss.config.js
    const pcConfig = `export default { plugins: { tailwindcss: {}, autoprefixer: {} } };\n`;
    writeFileSync(join(rootDir, "postcss.config.js"), pcConfig, "utf8");
  },
};
