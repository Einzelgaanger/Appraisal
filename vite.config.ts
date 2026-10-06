import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  // `npm run dev` and `npm run dev:local` both write node_modules/.vite.
  // A shared cache leaves one server stuck on deps_temp and answering 504
  // "Outdated Optimize Dep", which blanks the page.
  cacheDir: path.resolve(__dirname, `node_modules/.vite-${mode}`),
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  preview: {
    host: "0.0.0.0",
    allowedHosts: [
      "three60appraisal.onrender.com",
      "vggtools.onrender.com",
      "executive.vgg.tools",
      "ghc.vgg.tools",
      "vigipay.vgg.tools",
      "vgg.tools",
      "localhost",
    ],
  },
  plugins: [
    react(),
    mode === 'development' && componentTagger(),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@/integrations/supabase/client": path.resolve(__dirname, "./src/lib/supabase-client.ts"),
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
