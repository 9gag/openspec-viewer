#!/usr/bin/env node
/**
 * The installed tool: serve the built page, and the store behind it, from the directory
 * you ran the command in.
 *
 * That directory is the whole configuration. `server/store.mjs` shells `openspec list`
 * there, so running this in a repo that declares `store: <id>` reads that store, and
 * running it inside a store reads the store itself. Nothing here needs to know which
 * case it is in.
 *
 * Vite is a devDependency and is not installed alongside the published package, so this
 * serves `dist/` with `node:http` rather than `vite preview`.
 */

import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { apiHandler, isApiPath } from "../server/api.mjs";
import { ORIGIN } from "../server/store.mjs";

const PKG_ROOT = resolve(fileURLToPath(import.meta.url), "..", "..");
const DIST = join(PKG_ROOT, "dist");
const DEFAULT_PORT = 5175;

const TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
};

function parseArgs(argv) {
  const opts = { port: DEFAULT_PORT, open: true, help: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") opts.help = true;
    else if (arg === "--no-open") opts.open = false;
    else if (arg === "--port" || arg === "-p") opts.port = Number(argv[++i]);
    else if (arg.startsWith("--port=")) opts.port = Number(arg.slice(7));
    else {
      console.error(`openspec-viewer: unknown argument '${arg}'`);
      process.exit(2);
    }
  }
  if (!Number.isInteger(opts.port) || opts.port < 1 || opts.port > 65535) {
    console.error("openspec-viewer: --port needs a port number");
    process.exit(2);
  }
  return opts;
}

const HELP = `openspec-viewer — a read-only web view of an OpenSpec store

  openspec-viewer [--port <n>] [--no-open]

Run it in a repo that declares a store in openspec/config.yaml, or inside the
store itself. The store is resolved by the openspec CLI, which must be on PATH.

  --port, -p <n>   port to listen on (default ${DEFAULT_PORT})
  --no-open        do not open a browser
  --help, -h       this text
`;

/**
 * Resolve a URL path inside dist/. Returns null for anything that escapes it, which is
 * the only thing standing between a served directory and `GET /../../.ssh/id_rsa`.
 */
function assetFor(pathname) {
  const rel = normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, "");
  const abs = join(DIST, rel);
  if (!abs.startsWith(DIST)) return null;
  if (existsSync(abs) && statSync(abs).isFile()) return abs;
  return null;
}

function serve(req, res) {
  const { pathname } = new URL(req.url, "http://localhost");

  if (isApiPath(pathname)) {
    apiHandler(req, res);
    return;
  }

  // Routing is by hash, so the server only ever has to answer '/' and real asset paths.
  const file = pathname === "/" ? join(DIST, "index.html") : assetFor(pathname);
  if (!file) {
    res.statusCode = 404;
    res.end("Not found");
    return;
  }

  res.setHeader("content-type", TYPES[extname(file)] ?? "application/octet-stream");
  // The bundle is rebuilt on every publish and served from a package directory whose
  // contents change under the same URL on upgrade, so caching it would strand people on
  // the previous version's page.
  res.setHeader("cache-control", "no-store");
  createReadStream(file).pipe(res);
}

const opts = parseArgs(process.argv.slice(2));
if (opts.help) {
  process.stdout.write(HELP);
  process.exit(0);
}

if (!existsSync(join(DIST, "index.html"))) {
  console.error(
    "openspec-viewer: no built page in this package (dist/index.html is missing).\n" +
      "A published copy ships one; from a clone, run `pnpm build` first.",
  );
  process.exit(1);
}

const server = createServer(serve);

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(
      `openspec-viewer: port ${opts.port} is already in use — pass --port <n> for another.`,
    );
    process.exit(1);
  }
  throw err;
});

server.listen(opts.port, () => {
  const url = `http://localhost:${opts.port}`;
  console.log(`openspec-viewer  ${url}`);
  console.log(`reading the store resolved from  ${ORIGIN}`);
  if (opts.open) {
    const cmd =
      process.platform === "darwin"
        ? "open"
        : process.platform === "win32"
          ? "start"
          : "xdg-open";
    import("node:child_process").then(({ spawn }) => {
      // Opening a browser is a convenience; a machine without one (CI, a container, a
      // remote shell) should still be left with a running server.
      spawn(cmd, [url], { stdio: "ignore", detached: true, shell: process.platform === "win32" })
        .on("error", () => {})
        .unref();
    });
  }
});
