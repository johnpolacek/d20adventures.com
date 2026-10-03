import { fileURLToPath } from "node:url"
import tailwind from "@tailwindcss/postcss"
import { defineConfig } from "vite"
export default defineConfig({
  resolve: {
    alias: [
      { find: /^@\/lib\/utils$/, replacement: fileURLToPath(new URL("./src/utils.ts", import.meta.url)) },
      { find: "@", replacement: fileURLToPath(new URL("../../", import.meta.url)) },
    ],
  },
  css: { postcss: { plugins: [tailwind()] } },
  clearScreen: false,
  build: { target: "safari16" },
})
