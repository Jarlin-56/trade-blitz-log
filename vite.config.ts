import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import electron from "vite-plugin-electron";

const nodeBuildCompatibility = () => ({
  name: 'rollup-node-compatibility',
  configResolved(config: import('vite').ResolvedConfig) {
    // vite-plugin-electron supplies a Rolldown-only option even under Vite 5.
    Reflect.deleteProperty(config.build.rollupOptions, 'platform');
  },
});

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  return ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [
    react(), 
    electron([{
        entry: 'electron/main.ts',
        vite: { plugins: [nodeBuildCompatibility()], define: { 'process.env.VITE_SUPABASE_URL': JSON.stringify(env.VITE_SUPABASE_URL) }, build: { rollupOptions: { output: { format: 'es' } } } },
      }, {
        onstart({ reload }) { reload(); },
        vite: { plugins: [nodeBuildCompatibility()], build: { emptyOutDir: false, rollupOptions: { input: path.resolve(__dirname, 'electron/preload.ts'), output: { format: 'cjs', entryFileNames: 'preload.cjs' } } } },
    }])
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"],
  },
  });
});
