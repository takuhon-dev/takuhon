import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// The admin screen is a single self-contained script enqueued by WordPress, so
// it is built in library (IIFE) mode into the plugin directory (`takuhon/build`,
// which ships inside the plugin zip). React, @takuhon/core, and the
// @takuhon/api HTML renderer are all bundled in; nothing is provided by
// WordPress at runtime. Source maps are off so no host paths leak into the
// shipped artifact.
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'takuhon/build',
    emptyOutDir: true,
    target: 'es2022',
    sourcemap: false,
    lib: {
      entry: 'src/admin/index.tsx',
      formats: ['iife'],
      name: 'TakuhonAdmin',
      fileName: () => 'admin.js',
    },
  },
});
