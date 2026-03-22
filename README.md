# Post-quantum file sharing

End-to-end encrypted file drops using **ML-KEM** in the browser (Rust → WebAssembly), an **Express** API on **Node**, and **Supabase** (Postgres + Auth + Storage). The server stores ciphertext and metadata only; decryption happens client-side.

## Documentation

| Doc | Contents |
|-----|----------|
| [`backend/README.md`](backend/README.md) | API routes, env vars, rate limits, tests, Supabase notes |
| [`design.md`](design.md) | Schema intent, storage layout, high-level API & flows |
| [`frontend/README.md`](frontend/README.md) | Vite app, env vars, WASM build, deployment build notes |
| [`supabase/README.md`](supabase/README.md) | SQL migrations to apply in Supabase |
| [`ADOPTION.md`](ADOPTION.md) | **Production readiness:** stress testing & security audit expectations before adoption |

This project is not a turnkey certified product. Before relying on it for sensitive or high-scale use, read [**ADOPTION.md**](ADOPTION.md): it explains why **load/soak testing** and **independent security (and crypto) review** are required, what scope they should cover, and how they differ.

## Architecture (short)

- **Frontend** (`frontend/`) — React + Vite; Supabase Auth (anon key); calls backend over `VITE_API_URL` in production.
- **Backend** (`backend/`) — Express; **service role** for DB/Storage; validates JWTs for owner routes.
- **Crypto** — `frontend/src/wasm/crypto-module/pkg/` holds **wasm-pack** output (tracked in git so **Vercel** / CI can build without Rust). Rust sources live under `frontend/public/crypto-module/`.

## Prerequisites

- Node.js (LTS recommended)
- A **Supabase** project (URL, anon key, service role key)
- For regenerating WASM locally: **Rust** + [`wasm-pack`](https://rustwasm.github.io/wasm-pack/)

## Local development

Browsers need **both** the UI and the API:

1. **Web UI (Vite)** — default **http://localhost:5173**
2. **API (Express)** — default **http://localhost:3001**

### Option A — one command (repo root)

```bash
cd post-quantum-file-sharing
npm install
npm install --prefix backend
npm install --prefix frontend
npm run dev
```

(`npm run dev` at the repo root starts API + Vite via `concurrently`; each app needs its own `node_modules`.)

Open **http://localhost:5173**. The API is on **3001**; with `VITE_API_URL` unset, Vite proxies `/me`, `/boxes`, and `/files` to the backend (see `frontend/vite.config.ts`).

### Option B — two terminals

```bash
# Terminal 1 — API
cd backend && npm install && npm run dev

# Terminal 2 — UI
cd frontend && npm install && npm run dev
```

### Configuration

- **`backend/.env`** — `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, optional `FRONTEND_URL` (e.g. `http://localhost:5173`), see backend README.
- **`frontend/.env`** — `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`; optional `VITE_API_URL` (e.g. `http://localhost:3001` if not using the proxy). Copy from `frontend/.env.example`.

Do not commit real `.env` files; they are gitignored.

## Deployment (typical)

Deploy **frontend** and **backend** separately (e.g. **Vercel** + **Railway**).

1. **Backend** — set `PORT` from the host, `SUPABASE_*`, `FRONTEND_URL` (public SPA origin), `TRUST_PROXY=1` behind a reverse proxy, and optional upload rate-limit vars (see backend README).
2. **Frontend** — set **`VITE_API_URL`** to the **public API URL** at **build time** (Vercel project env). Set `VITE_SUPABASE_*` the same way.
3. **Supabase** — Auth **Site URL** and **Redirect URLs** must include your production SPA origin. For **Google sign-in**, enable the Google provider and set the Google OAuth redirect URI to Supabase’s callback (see **`supabase/README.md`**).

After deploy, confirm share links use `FRONTEND_URL` and that the upload page can reach the API (CORS + correct `VITE_API_URL`).
