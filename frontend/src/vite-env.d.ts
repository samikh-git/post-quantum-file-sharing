/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
  /** Backend API origin, e.g. `http://localhost:3001`. If unset, use Vite dev proxy for `/me`. */
  readonly VITE_API_URL: string
  /**
   * Optional. Public site origin for OAuth return (no path), e.g. `https://your-app.vercel.app`.
   * If unset, `window.location.origin` is used after Google sign-in.
   */
  readonly VITE_SITE_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
