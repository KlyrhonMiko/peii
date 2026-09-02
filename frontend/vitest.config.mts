import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"
import { defineConfig } from "vitest/config"

const rootDirectory = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  test: {
    environment: "jsdom",
    setupFiles: [resolve(rootDirectory, "src/test/setup.ts")],
  },
  resolve: {
    alias: {
      "@": resolve(rootDirectory, "src"),
      "server-only": resolve(rootDirectory, "src/test/server-only.ts"),
    },
  },
})
