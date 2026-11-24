import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

// La app es estática: el Worker de Cloudflare solo sirve dist/. Los datos viajan directo a Apps Script (VITE_API_URL).
export default defineConfig({
  plugins: [preact()],
  server: { fs: { allow: ['../../..'] } },
  build: { target: 'es2022', sourcemap: false, chunkSizeWarningLimit: 700 },
});
