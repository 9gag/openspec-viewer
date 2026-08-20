/**
 * Which tab a change page opens on.
 *
 * The tabs are the change's own files, and which files a change has is decided by the
 * schema it was created under — so no tab is guaranteed to be there. Reading a change
 * with a ui.md and then opening one without leaves the tab you were on naming nothing;
 * falling back to the first artifact is what keeps that from being a blank page.
 */
export function resolveTab(artifacts, current) {
  if (artifacts.some((a) => a.name === current)) return current;
  return artifacts[0]?.name ?? null;
}
