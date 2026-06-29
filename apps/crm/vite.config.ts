// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, nitro (build-only using cloudflare as a default target),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { loadEnv } from "vite";

// En desarrollo, el servidor (server.ts: Gmail, base de datos D1, claves IA) lee
// variables SIN prefijo VITE_ desde process.env. Vite solo inyecta las VITE_* en
// el cliente, por lo que cargamos el .env de la raíz del monorepo en process.env
// para que el servidor las vea. En producción las provee el host (no estorba).
Object.assign(process.env, loadEnv(process.env.NODE_ENV || "development", "../..", ""));

export default defineConfig({
  nitro: true,
  tanstackStart: {
    server: { entry: "server" },
  },
  vite: {
    // Lee el .env desde la raíz del monorepo (dos niveles arriba), no desde
    // apps/crm. Así una única .env sirve a todas las apps.
    envDir: "../..",
    server: {
      port: 8080,
      strictPort: true,
      headers: {
        "Content-Security-Policy":
          "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self' https://*.supabase.co wss://*.supabase.co;",
      },
    },
  },
});
