/**
 * The page mounted under a path, for a tool that is not this one.
 *
 * A host can have the store on its disk and still not have the root: a manual's dev
 * server serves its own page at `/`, so the viewer's `/api/...` has no room there, and a
 * snapshot written to disk is stale the moment a spec is saved. What such a host can
 * give is a path. `mounted()` is the connect handler for exactly that — under whatever
 * path it is mounted at it serves the built page and answers the store beneath it, so
 * the viewer sits inside a site it does not own.
 *
 * The façade rule `lib/store.mjs` states holds here too: this is the whole contract, and
 * `server/mount.mjs` is internal and moves whenever the handler needs it to.
 *
 * Node only. The page it serves is `dist/`, which the published package ships and a
 * clone has only after `pnpm build` — `hasPage()` is that check, so a host can mount
 * conditionally rather than answer with a 404 it cannot explain.
 */

export {
  /** A connect handler serving the page, and the store under it, at its mount point. */
  mounted,
  /** True when there is a built page to mount — the one thing `mounted()` cannot make. */
  hasPage,
} from "../server/mount.mjs";
