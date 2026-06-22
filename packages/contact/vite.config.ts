import { defineConfig } from 'vite';

/**
 * Builds the browser widget bundle (`src/widget/index.ts`) as a single
 * self-contained IIFE asset, `dist/contact-widget.js`, plus `contact-widget.css`.
 *
 * The Node-facing core (`src/index.ts`) is built separately by tsup; this config
 * only produces the browser asset. `emptyOutDir` is false so the tsup output in
 * `dist/` (built first) is preserved. Vitest reads `vitest.config.ts`, not this
 * file, so the test run is unaffected.
 */
export default defineConfig({
  build: {
    lib: {
      entry: 'src/widget/index.ts',
      formats: ['iife'],
      name: 'TakuhonContact',
      fileName: () => 'contact-widget.js',
    },
    outDir: 'dist',
    emptyOutDir: false,
    cssCodeSplit: false,
    sourcemap: false,
    target: 'es2020',
    rollupOptions: {
      output: {
        assetFileNames: 'contact-widget.[ext]',
      },
    },
  },
});
