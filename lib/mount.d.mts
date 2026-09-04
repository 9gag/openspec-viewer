/**
 * Types for `@seankcw/openspec-viewer/lib/mount`.
 *
 * Hand-written for the reason `store.d.mts` gives, and checked the same way: every
 * export is called from `test/lib.test.mjs` against the shapes below.
 */

import type { IncomingMessage, ServerResponse } from "node:http";

/**
 * The request the handler reads. `originalUrl` is what connect leaves behind when a
 * mount strips its own path off `url`, and is how the handler knows the address the
 * page will resolve `api/board.json` against.
 */
export type MountedRequest = IncomingMessage & { originalUrl?: string };

/**
 * A connect handler for the page and the store, under the path it is mounted at.
 *
 * `(req, res, next)`, in the shape both connect and `node:http` accept. Anything that is
 * neither the page, one of its answers, nor an asset is passed to `next` — the host's
 * own routing, not a 404 from here.
 */
export function mounted(): (
  req: MountedRequest,
  res: ServerResponse,
  next?: () => void,
) => void;

/** True when there is a built page to mount. False in a clone that has not built one. */
export function hasPage(): boolean;
