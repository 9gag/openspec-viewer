import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

import { apiHandler } from "./server/api.mjs";

/**
 * The store is read from disk and from git, so it has to be served by Node rather than
 * bundled — the browser has no store to look at. The routes live in server/api.mjs,
 * shared with the published binary; this only mounts them.
 *
 * Registered on the preview server too, so `pnpm build && pnpm preview` is a working app
 * rather than a page with no data behind it.
 */
function storeApi() {
  // Block bodies, not concise ones: `middlewares.use()` returns the connect app for
  // chaining, and the app is itself a function. Returning it makes Vite treat it as a
  // post-hook to invoke after its own middlewares, which calls it with no request.
  return {
    name: "openspec-store-api",
    configureServer(server) {
      server.middlewares.use("/api", apiHandler);
    },
    configurePreviewServer(server) {
      server.middlewares.use("/api", apiHandler);
    },
  };
}

export default defineConfig({
  // Assets are addressed relatively so the built page works from any mount point the
  // binary serves it at, not only the server root.
  base: "./",
  plugins: [react(), storeApi()],
  server: { port: 5175, open: true },
  preview: { port: 5175 },
});
