import tailwindcss from '@tailwindcss/postcss';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';

const projectPath = (relativePath: string) =>
  fileURLToPath(new URL(relativePath, import.meta.url));

export default defineConfig({
  root: projectPath('./standalone'),
  base: '/mountain/',
  publicDir: projectPath('./public'),
  css: { postcss: { plugins: [tailwindcss()] } },
  plugins: [react()],
  define: {
    'process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY': JSON.stringify(
      process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? '',
    ),
  },
  build: {
    outDir: projectPath('./dist-static'),
    emptyOutDir: true,
  },
});
