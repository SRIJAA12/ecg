/**
 * vite.config.ts
 * ==============
 * Vite build tool configuration for the Healthcare Simulation Monitor frontend.
 *
 * Key configurations:
 *   - React plugin: enables JSX fast refresh in development
 *   - Path alias: "@/" maps to "src/" for clean absolute imports
 *   - Public dir: "public/" is served as-is (our JSON waveform files live here)
 */

import path from "path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [
    // @vitejs/plugin-react uses Babel for Fast Refresh.
    // This means React state is preserved when you edit a component during dev.
    react(),
  ],

  resolve: {
    alias: {
      // "@/components/ECGCanvas" instead of "../../components/ECGCanvas"
      // This makes imports readable regardless of folder nesting depth.
      "@": path.resolve(__dirname, "./src"),
    },
  },

  // Vite serves everything in public/ at the root URL automatically.
  // So frontend/public/waveforms/ecg/sinus.json is available at:
  // http://localhost:5173/waveforms/ecg/sinus.json
  // React's fetch() can load this directly — no backend needed.
  publicDir: "public",

  server: {
    // Fix port so teammates and documentation always refer to the same URL
    port: 5173,
    open: false, // Don't auto-open browser (we open it manually to confirm it works)
  },
});
