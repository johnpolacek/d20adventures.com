import { fileURLToPath } from "node:url"
import { defineConfig, loadEnv } from "vite"

const root = fileURLToPath(new URL("../../", import.meta.url))
export default defineConfig(({ mode }) => {
  // Only the two public client values cross into the webview. Never CLI or server secrets.
  const env = loadEnv(mode, root, "NEXT_PUBLIC_")
  return {
    clearScreen: false,
    esbuild: { jsx: "automatic" },
    define: {
      "import.meta.env.VITE_CLERK_PUBLISHABLE_KEY": JSON.stringify(env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY),
      "import.meta.env.VITE_CONVEX_URL": JSON.stringify(env.NEXT_PUBLIC_CONVEX_URL),
    },
    build: { target: "safari14" },
  }
})
