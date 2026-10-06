/** Order changes in each list: decisions still needed first, then newest proposals. */
export function compareChanges(a, b) {
  const aAccepted = a.acceptance != null;
  const bAccepted = b.acceptance != null;
  if (aAccepted !== bAccepted) return aAccepted ? 1 : -1;

  const aDate = typeof a.proposedAt === "string" ? a.proposedAt : null;
  const bDate = typeof b.proposedAt === "string" ? b.proposedAt : null;
  if (aDate !== bDate) {
    if (aDate === null) return 1;
    if (bDate === null) return -1;
    return bDate < aDate ? -1 : 1;
  }

  return String(a.id ?? "").localeCompare(String(b.id ?? ""));
}

export const sortChanges = (changes) => [...changes].sort(compareChanges);
