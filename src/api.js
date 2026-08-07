import { useCallback, useEffect, useState } from "react";

// The store changes when someone runs git, not while the page is open, so polling is
// enough and there is no socket to keep alive.
export const POLL_MS = 5000;

/**
 * Fetch one of the store endpoints, keeping the last good response on screen if a later
 * poll fails. A stale board with a banner saying so beats a blank page.
 *
 * `poll: false` for artifact bodies — proposals and specs do not change while you read
 * them, and re-fetching a change's full text every 5s would re-render a document under
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

  useEffect(() => {
    setState((s) => ({ ...s, loading: true }));
    load();
    if (!poll) return undefined;

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
 * Hash routing, hand-rolled.
 *
 * Four views and no nested state, so a router dependency would be more code to install
 * than to replace. Hash rather than history so the built bundle works when served from
 * anywhere without server-side rewrites.
 */
export function useRoute() {
  const [hash, setHash] = useState(() => window.location.hash.slice(1) || "/");

  useEffect(() => {
    const onHash = () => setHash(window.location.hash.slice(1) || "/");
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  // filter(Boolean) rather than destructuring with defaults: '/'.split('/') is ['', ''],
  // and '' is not undefined, so a default would never apply and the root would route to
  // no view at all.
  const parts = hash.split("/").filter(Boolean);
  return {
    view: parts[0] || "board",
    arg: parts[1] ? decodeURIComponent(parts[1]) : null,
    hash,
  };
}

export const href = (view, arg) =>
  `#/${view}${arg ? `/${encodeURIComponent(arg)}` : ""}`;
