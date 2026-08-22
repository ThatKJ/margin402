import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    server: {
      deps: {
        // @x402/next's ESM build imports "next/server" in a way Vite's
        // default resolver can't follow through next's exports map, even
        // though Node (tsx, next dev/build) resolves it fine. Inlining
        // routes it through Vite's own transform instead, which resolves
        // it correctly.
        inline: [/@x402\//, /^next$/],
      },
    },
  },
});
