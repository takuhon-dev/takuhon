import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// The admin UI is served at `/admin` behind a strict CSP (security.md §1.2:
// `script-src 'self'; style-src 'self'; require-trusted-types-for 'script'`).
// These build options keep every asset an external file so nothing relies on
// inline scripts/styles or `data:`/`blob:` sources:
//   - assetsInlineLimit: 0      — never inline assets as data URIs
//   - cssCodeSplit: false       — one external stylesheet, no runtime <style>
//   - modulePreload.polyfill    — drop Vite's inline preload-polyfill script
export default defineConfig({
  base: './',
  plugins: [react()],
  server: {
    // Distinct from the playground (5173) so both can run side by side.
    port: 5174,
    strictPort: true,
  },
  build: {
    target: 'es2022',
    assetsInlineLimit: 0,
    cssCodeSplit: false,
    modulePreload: { polyfill: false },
  },
});
