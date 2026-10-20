import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { '~': new URL('./src', import.meta.url).pathname } },
  test: {
    projects: [
      { test: { name: "convex", environment: "edge-runtime", include: ["convex/studio.test.ts", "convex/wellness.test.ts"] } },
      {
        extends: true,
        test: { name: "react-server", environment: "node", include: ["convex/react.test.ts"] },
      },
      {
        extends: true,
        test: { name: "wellness-engine", environment: "node", include: ["src/lib/wellness/*.test.ts"] },
      },
    ],
  },
});
