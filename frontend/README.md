# Frontend (Vite + React)

Browser app for the **post-quantum file sharing** project: dashboard (Supabase Auth + drop links), **ML-KEM** crypto via **WebAssembly**, and upload/download flows against the Express API.

## Environment variables

Copy **`frontend/.env.example`** → **`.env`** (gitignored).

| Variable | Required | Purpose |
|----------|----------|---------|
| `VITE_SUPABASE_URL` | Yes* | Supabase project URL (browser-safe). |
| `VITE_SUPABASE_ANON_KEY` | Yes* | Supabase **anon** key only — never the service role key. |
| `VITE_API_URL` | No | Backend origin, e.g. `http://localhost:3001` or `https://your-api.up.railway.app`. **If unset**, the Vite **dev** server proxies `/me`, `/boxes`, `/files` to `http://localhost:3001` (see `vite.config.ts`). **Production builds** (Vercel, etc.) must set this to your real API URL. |
| `VITE_SITE_URL` | No | Public origin for **Google OAuth** `redirectTo` (no path), e.g. `https://your-app.vercel.app`. Must match an allowed URL in Supabase. If unset, **`window.location.origin`** is used (typical for dev and same-tab prod). |

\*If missing, the app uses placeholder Supabase config and shows setup hints (see `src/lib/supabase.ts`).

**Sign-in:** Email/password and **Continue with Google** (`signInWithOAuth`). Configure Google in Supabase; see **[`supabase/README.md`](../supabase/README.md)**.

## Scripts

```bash
npm install
npm run dev      # Vite dev server (HMR)
npm run build    # tsc -b && vite build → dist/
npm run preview  # Serve production build locally
npm run lint     # ESLint
```

## WebAssembly (crypto module)

- **Runtime import:** `src/lib/cryptoLocal.ts` loads from **`src/wasm/crypto-module/pkg/crypto_module.js`**, which loads **`crypto_module_bg.wasm`** next to it (via `import.meta.url`).
- **Generated output is committed** under `src/wasm/crypto-module/pkg/` so **Vercel** and other CI environments can run `npm run build` **without** installing Rust. Do not re-add a `pkg/.gitignore` that ignores the whole folder.

### Rebuilding from Rust (local)

Rust crate: **`frontend/public/crypto-module/`** (see `Cargo.toml` there).

```bash
cd frontend/public/crypto-module
wasm-pack build --target web --out-dir ../../src/wasm/crypto-module/pkg
```

Use the same `wasm-pack` target/out-dir your project expects; if `wasm-pack` recreates **`pkg/.gitignore`** with `*`, remove or adjust it before committing so CI keeps seeing the artifacts.

## Vercel (SPA / share links)

Share URLs use **client-side** routes such as **`/drop/:username/:slug`**. Static hosts have no file at that path, so you need a **fallback to `index.html`**.

This repo includes **`vercel.json`** with a rewrite so Vercel serves **`index.html`** for non-asset paths (React Router then renders the upload page). Without it, opening a share link shows **404 NOT_FOUND** from Vercel.

Set the Vercel project **Root Directory** to **`frontend`** (or ensure `vercel.json` from `frontend/` is used). Redeploy after adding the file.

## API routing

- **Development:** Either set `VITE_API_URL=http://localhost:3001` or leave it unset and rely on the **Vite proxy** for API paths.
- **Production:** Set **`VITE_API_URL`** in the **build environment** (e.g. Vercel project variables). Values are baked in at build time (`import.meta.env`).

## Routes (React Router)

| Path | Purpose |
|------|---------|
| `/` | Dashboard (sign-in, boxes, files, Finalize) |
| `/user` | Account: public handle, delete account |
| `/drop/:username/:slug` | Public encrypted upload |
| `/about` | About page |

## Stack notes

- **React 19**, **Vite 8**, **React Compiler** (see Vite / React docs for compiler implications).
- ESLint config can be extended with type-aware rules (template text in the original Vite scaffold still applies).
