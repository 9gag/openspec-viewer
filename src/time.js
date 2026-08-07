/**
 * How long a claim may sit without progress before it is worth saying something.
 *
 * These are conversation prompts, not rules. `quiet` is "worth a nudge in standup",
 * `stale` is "this is the state the claim-at-pickup convention exists to prevent —
 * either pick it back up or hand it back so someone else can take it".
 */
export const QUIET_DAYS = 3;
export const STALE_DAYS = 7;

export function level(idle) {
  if (!idle) return "none";
  if (idle.days >= STALE_DAYS) return "stale";
  if (idle.days >= QUIET_DAYS) return "quiet";
  return "fresh";
}

/**
 * "6d", "4h", "just now" — short enough to sit in a table cell.
 *
 * Deliberately coarse above a day: nobody schedules work on "6d 4h", and the extra
 * precision would imply the timestamp means more than "when that commit landed".
 */
export function ago(at, now = Date.now()) {
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < 45) return "just now";
  if (s < 5400) return `${Math.round(s / 60)}m ago`;
  const h = Math.round(s / 3600);
  if (h < 36) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

export const exact = (at) =>
  new Date(at).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });

/**
 * Astryx's `<Timestamp>` reads a bare number as Unix *seconds*; every timestamp from the
 * server is milliseconds. Passing ms straight through dates everything to the year
 * 58,000-odd, so always hand it an ISO string.
 */
export const iso = (at) => new Date(at).toISOString();
