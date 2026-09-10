import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
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
      "appraisal.vgg.app",
      "executive.vgg.app",
      "ghc.vgg.app",
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
