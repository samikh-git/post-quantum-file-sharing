import { defineConfig } from 'vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    babel({ presets: [reactCompilerPreset()] })
  ],
  server: {
    proxy: {
      // When `VITE_API_URL` is unset, same-origin `fetch('/…')` is forwarded to Express.
      '/me': { target: 'http://localhost:3001', changeOrigin: true },
      '/boxes': { target: 'http://localhost:3001', changeOrigin: true },
      '/files': { target: 'http://localhost:3001', changeOrigin: true },
    },
  },
})
