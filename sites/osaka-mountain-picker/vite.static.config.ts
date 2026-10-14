import tailwindcss from '@tailwindcss/postcss';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';

const projectPath = (relativePath: string) =>
  fileURLToPath(new URL(relativePath, import.meta.url));

const requestedBasePath = process.env.MOUNTAIN_PUBLIC_BASE_PATH?.trim() || '/mountain/';
const publicBasePath = `/${requestedBasePath.replace(/^\/+|\/+$/g, '')}/`;
const appBasePath = publicBasePath.replace(/\/$/u, '');
const weatherEndpoint = process.env.MOUNTAIN_WEATHER_ENDPOINT?.trim() || `${appBasePath}/api/weather`;

export default defineConfig({
  root: projectPath('./standalone'),
  base: publicBasePath,
  publicDir: projectPath('./public'),
  css: { postcss: { plugins: [tailwindcss()] } },
  plugins: [react()],
  define: {
    'process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY': JSON.stringify(
      process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? '',
    ),
    __MOUNTAIN_PUBLIC_BASE_PATH__: JSON.stringify(appBasePath),
    __MOUNTAIN_WEATHER_ENDPOINT__: JSON.stringify(weatherEndpoint),
  },
  build: {
    outDir: projectPath('./dist-static'),
    emptyOutDir: true,
  },
});
