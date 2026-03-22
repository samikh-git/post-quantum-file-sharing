# Supabase migrations

SQL migrations in this folder are applied to your Supabase **Postgres** project (CLI or Dashboard).

| File | Purpose |
|------|---------|
| `migrations/20250321180000_sync_public_users_on_auth_user.sql` | Keeps **`public.users`** in sync with new **`auth.users`** rows so dashboard and `POST /boxes` have a profile row. |

After applying, configure **Authentication → URL configuration** (Site URL, redirect URLs) for each deployed frontend origin. See the main **[`README.md`](../README.md)** and **[`backend/README.md`](../backend/README.md)**.

### Google sign-in (OAuth)

1. **Google Cloud Console** ([APIs & Services → Credentials](https://console.cloud.google.com/apis/credentials)): create an **OAuth 2.0 Client ID** of type **Web application**.  
   - **Authorized redirect URIs** must include your Supabase callback:  
     `https://<YOUR_PROJECT_REF>.supabase.co/auth/v1/callback`  
     (exact value is under **Supabase → Authentication → Providers → Google**).
2. **Supabase Dashboard → Authentication → Providers → Google**: enable Google, paste **Client ID** and **Client secret**.
3. **Supabase → Authentication → URL configuration**: set **Site URL** to your deployed app (e.g. `https://your-app.vercel.app`). Add the same URL (and `http://localhost:5173` for local dev) under **Redirect URLs** if required by your project settings.
4. **Frontend**: optional **`VITE_SITE_URL`** — same origin as Site URL, no trailing path (used as OAuth `redirectTo` after Google; defaults to `window.location.origin` if unset).

New Google users still need a **`public.users`** row (use the sync migration above).
