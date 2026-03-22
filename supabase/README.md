# Supabase migrations

SQL migrations in this folder are applied to your Supabase **Postgres** project (CLI or Dashboard).

| File | Purpose |
|------|---------|
| `migrations/20250321180000_sync_public_users_on_auth_user.sql` | Keeps **`public.users`** in sync with new **`auth.users`** rows so dashboard and `POST /boxes` have a profile row. |

After applying, configure **Authentication → URL configuration** (Site URL, redirect URLs) for each deployed frontend origin. See the main **[`README.md`](../README.md)** and **[`backend/README.md`](../backend/README.md)**.
