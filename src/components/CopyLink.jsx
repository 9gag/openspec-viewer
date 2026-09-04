import { Icon } from "@astryxdesign/core/Icon";
import { IconButton } from "@astryxdesign/core/IconButton";
import { useState } from "react";

import {
  absoluteLink,
  HEADING_KEY,
  SCENARIO_KEY,
  withPosition,
} from "../toc.js";

/**
 * The button beside something addressable, which puts its address on the clipboard.
 *
 * A scenario and a heading are both places in a document a reader points someone else at,
 * and pointing at one means sending a URL rather than a name — so the address is built
 * whole here, origin and route included, and the pasted link opens the page on the thing
 * the button sat next to.
 *
 * The position is given as the one it is — `to` for a heading, `at` for a scenario — and
 * assembled against the route at click time, so the link is the one the reader is looking
 * at now, whatever they navigated through to get here.
 *
 * It goes inside the fragment, after the route, because the fragment is where the route is:
 * this app is hash-routed, and a position put in the query instead would stay in the
 * address after the reader had left the page it points into. What the query still carries
 * is the reading — `?mode=dark` — and the copied link keeps it, so a page sent to someone
 * arrives looking the way it looked to whoever sent it.
 */
export default function CopyLink({ to, at, label, className }) {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    const key = to ? HEADING_KEY : SCENARIO_KEY;
    navigator.clipboard
      ?.writeText(
        absoluteLink(withPosition(window.location.hash, key, to ?? at)),
      )
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      })
      // A blocked clipboard is not worth an error state: the page is still addressable
      // through the address bar, which is where this link came from.
      .catch(() => {});
  };

  // The span is what the hover rules hang off — Astryx owns the button's own class list,
  // and a wrapper keeps the show-on-hover styling out of it.
  return (
    <span className={className}>
      <IconButton
        icon={<Icon icon={copied ? "check" : "copy"} size="sm" />}
        size="sm"
        variant="ghost"
        label={copied ? "Link copied" : label}
        onClick={copy}
      />
    </span>
  );
}
