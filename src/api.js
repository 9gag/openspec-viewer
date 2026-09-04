import { useCallback, useEffect, useRef, useState } from "react";

import { HEADING_KEY, positionIn, SCENARIO_KEY } from "./toc.js";

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

/** Where an empty hash lands, and the shape every route has. */
const NOWHERE = { [HEADING_KEY]: null, [SCENARIO_KEY]: null };
const BOARD = { view: "board", arg: null, tab: null, position: NOWHERE };

/**
 * The view, argument, tab and position a hash names, or null when the hash is not a route
 * at all.
 *
 * A URL has one fragment and this app spends it on the route, so `#/change/<id>` and
 * `#a-heading-on-this-page` arrive through the same door. Read by position alone an anchor
 * becomes a view: `#tech-design--3-one-temporary-impact-contract` was read as a view named
 * `tech-design--3-one-temporary-impact-contract`, which nothing renders — a blank page
 * under a nav that still worked, reachable by clicking an entry in the page's own outline
 * rail and then reloading.
 *
 * The leading slash separates them, and it is checked before the position is split off so
 * it keeps separating them: `#?to=purpose` is a position with no page under it, which is
 * an address for nowhere and leaves the reader on what they are reading.
 *
 * Exported apart from the hook because this is the part that can be wrong, and a hook
 * needs a browser to test.
 */
export function routeFrom(hash) {
  const fragment = String(hash ?? "").replace(/^#/, "");
  if (fragment === "" || fragment === "/") return BOARD;
  if (!fragment.startsWith("/")) return null;

  // The position travels in the same string as the route it belongs to, so that the two
  // move together — see `withPosition`. Everything below reads the route half alone.
  const cut = fragment.indexOf("?");
  const path = cut === -1 ? fragment : fragment.slice(0, cut);

  // filter(Boolean) rather than destructuring with defaults: '/'.split('/') is ['', ''],
  // and '' is not undefined, so a default would never apply and the root would route to
  // no view at all.
  const parts = path.split("/").filter(Boolean);
  return {
    view: parts[0] || "board",
    arg: parts[1] ? decodeURIComponent(parts[1]) : null,
    // A third segment is which of the page's tabs is open. Only the pages that have tabs
    // read it, and an argument is encoded whole — a capability is `storefront/checkout`,
    // one segment with its slash escaped — so the tab cannot be mistaken for part of it.
    tab: parts[2] ? decodeURIComponent(parts[2]) : null,
    position: positionIn(fragment),
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
 *
 * Nothing here sweeps up a stale position. The route and the position inside it are one
 * string, so following a link in the nav overwrites the second along with the first — the
 * address cannot go on naming a heading on a page the reader has left. What is left in the
 * query is the reading the link was written for: `?mode=dark`, `?board=`, `?filter=`,
 * which are about the visit rather than about a page, and are supposed to survive.
 */
export function useRoute() {
  const [route, setRoute] = useState(
    () => routeFrom(window.location.hash) ?? BOARD,
  );

  useEffect(() => {
    const onHash = () => {
      const next = routeFrom(window.location.hash);
      if (!next) return;
      // The route whole, position included. An address that moves the position without
      // moving the page — a citation to a scenario in the change already open, which names
      // no tab of its own — differs from the one on screen only there, and a route that
      // kept the old position would leave the reader on the tab they were already on
      // rather than the one the link named. A new object re-renders the view; it does not
      // remount it, so the document under it, and the scroll down it, both stay.
      setRoute(next);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  return route;
}

export const href = (view, arg, tab) =>
  `#/${view}${arg ? `/${encodeURIComponent(arg)}` : ""}${
    arg && tab ? `/${encodeURIComponent(tab)}` : ""
  }`;
