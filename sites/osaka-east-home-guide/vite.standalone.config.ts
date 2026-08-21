import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig({
  plugins: [react()],
  build: {
    emptyOutDir: true,
    outDir: "standalone-dist",
    cssCodeSplit: false,
    assetsInlineLimit: Number.MAX_SAFE_INTEGER,
    lib: {
      entry: resolve(__dirname, "standalone/entry.tsx"),
      formats: ["iife"],
      name: "OsakaEastHomeGuide",
      fileName: () => "app.js",
    },
  },
});
