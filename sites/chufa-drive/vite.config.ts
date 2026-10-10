import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  root: 'app',
  base: '/drive/',
  plugins: [react()],
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    target: 'es2022',
    chunkSizeWarningLimit: 600,
  },
  server: {
    port: 5190,
    proxy: {
      '/drive/api': { target: 'http://127.0.0.1:4191' },
    },
  },
});
