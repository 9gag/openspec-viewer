import { useCallback, useEffect, useRef, useState } from "react";

// The store changes when someone runs git, not while the page is open, so polling is
// enough and there is no socket to keep alive.
//
// A minute, because that is the pace the thing being watched actually moves at: a claim or
// a checkmark is a commit somebody makes between stretches of work, minutes apart at best.
// Every poll spawns a git process per change to read its history, so the old five seconds
// bought a freshness nobody could use and charged the machine for it twelve times a minute.
export const POLL_MS = 60_000;

/**
 * Fetch one of the store endpoints, keeping the last good response on screen if a later
 * poll fails. A stale board with a banner saying so beats a blank page.
 *
 * `poll: false` for artifact bodies — proposals and specs do not change while you read
 * them, and re-fetching a change's full text on any timer would re-render a document under
 * the reader's cursor.
 */
export function useApi(path, { poll = true } = {}) {
  const [state, setState] = useState({
    data: null,
    error: null,
    at: null,
    loading: true,
  });

  const load = useCallback(async () => {
    if (!path) return;
    try {
      const res = await fetch(path);
      const body = await res.json();
      if (!res.ok || body.error)
        throw new Error(body.error ?? `HTTP ${res.status}`);
      setState({ data: body, error: null, at: Date.now(), loading: false });
    } catch (err) {
      setState((s) => ({ ...s, error: err.message, loading: false }));
    }
  }, [path]);

  // Two effects rather than one, because they answer to different questions. The fetch
  // belongs to the path: ask once, whenever what is being asked for changes. The timer
  // belongs to whether anyone is looking: `poll` is toggled as the reader moves between
  // views, and a single effect made turning it *off* refetch the data being navigated
  // away from — a second's worth of git the reader is no longer waiting for, landing in
  // front of the view they actually asked for.
  const started = useRef(false);

  useEffect(() => {
    started.current = false;
    setState((s) => ({ ...s, loading: true }));
    load();
  }, [load]);

  useEffect(() => {
    if (!poll) return undefined;
    // Not on the first run — the effect above has just loaded this path. This is for
    // polling switched back on, where a reader returning to a view wants it read now
    // rather than whenever the interval next comes round.
    if (started.current) load();
    started.current = true;

    const timer = setInterval(load, POLL_MS);
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [load, poll]);

  return { ...state, reload: load };
}

/**
 * The view and argument a hash names, or null when the hash is not a route at all.
 *
 * A URL has one fragment and this app spends it on the route, so `#/change/<id>` and
 * `#a-heading-on-this-page` arrive through the same door. Read by position alone an anchor
 * becomes a view: `#tech-design--3-one-temporary-impact-contract` was read as a view named
 * `tech-design--3-one-temporary-impact-contract`, which nothing renders — a blank page
 * under a nav that still worked, reachable by clicking an entry in the page's own outline
 * rail and then reloading.
 *
 * The leading slash separates them. Every route this app writes has one; an anchor never
 * does, because an anchor is a slug of a heading.
 *
 * Exported apart from the hook because this is the part that can be wrong, and a hook
 * needs a browser to test.
 */
export function routeFrom(hash) {
  const path = String(hash ?? "").replace(/^#/, "");
  if (path === "" || path === "/") return { view: "board", arg: null };
  if (!path.startsWith("/")) return null;

  // filter(Boolean) rather than destructuring with defaults: '/'.split('/') is ['', ''],
  // and '' is not undefined, so a default would never apply and the root would route to
  // no view at all.
  const parts = path.split("/").filter(Boolean);
  return {
    view: parts[0] || "board",
    arg: parts[1] ? decodeURIComponent(parts[1]) : null,
  };
}

/**
 * Hash routing, hand-rolled.
 *
 * Four views and no nested state, so a router dependency would be more code to install
 * than to replace. Hash rather than history so the built bundle works when served from
 * anywhere without server-side rewrites.
 *
 * A hash that is not a route leaves the view alone: the browser scrolls to the anchor, the
 * page under it carries on rendering, and the reader keeps the document they were reading.
 */
export function useRoute() {
  const [route, setRoute] = useState(
    () => routeFrom(window.location.hash) ?? { view: "board", arg: null },
  );

  useEffect(() => {
    const onHash = () => {
      const next = routeFrom(window.location.hash);
      if (next) setRoute(next);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  return route;
}

export const href = (view, arg) =>
  `#/${view}${arg ? `/${encodeURIComponent(arg)}` : ""}`;
