import { Icon } from "@astryxdesign/core/Icon";
import { IconButton } from "@astryxdesign/core/IconButton";
import { useState } from "react";

import { absoluteLink } from "../toc.js";

/**
 * The button beside something addressable, which puts its address on the clipboard.
 *
 * A scenario and a heading are both places in a document a reader points someone else at,
 * and pointing at one means sending a URL rather than a name — so the address is built
 * whole here, origin and route included, and the pasted link opens the page on the thing
 * the button sat next to.
 *
 * `search` is the query the link travels in — `?at=<scenario>` or `?to=<heading>`. It is
 * a query rather than a fragment because the fragment is already the route: this app is
 * hash-routed, so a position inside the page cannot go there without taking the address of
 * the page with it. The route is read at click time and appended, so the link is the one
 * the reader is looking at now, whatever they navigated through to get here.
 */
export default function CopyLink({ search, label, className }) {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    navigator.clipboard
      ?.writeText(absoluteLink(search))
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
