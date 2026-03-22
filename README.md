# Post-quantum file sharing

## Local dev (fixes `ERR_CONNECTION_REFUSED`)

Browsers show **connection refused** when nothing is listening on that port. You need **both** processes running:

1. **Web UI (Vite)** — default **http://localhost:5173**  
2. **API (Express)** — default **http://localhost:3001**

### Option A — one command (repo root)

```bash
cd post-quantum-file-sharing
npm install
npm run dev
```

Then open **http://localhost:5173** in the browser (not port 3001; that URL is API-only).

### Option B — two terminals

```bash
# Terminal 1 — API
cd backend && npm install && npm run dev

# Terminal 2 — UI
cd frontend && npm install && npm run dev
```

Configure `backend/.env` and `frontend/.env` per `frontend/.env.example` and the backend README.
