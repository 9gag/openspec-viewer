/**
 * Light / dark / follow-the-OS, handed straight to Astryx's `<Theme mode>`.
 *
 * The values are Astryx's `ThemeMode` union, not ours — `Theme` only acts on 'light' and
 * 'dark' and treats anything else as "follow the system", so a typo here would silently
 * degrade to Auto rather than fail. A test pins them to the published type.
 */
export const MODES = [
  { value: "system", label: "Auto" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

export const DEFAULT_MODE = "system";

// Remembered per browser, like the lens: which mode you read in is a property of you and
// your screen, not of the store.
const KEY = "openspec-viewer.mode";

const isMode = (value) => MODES.some((m) => m.value === value);

export function loadMode() {
  // ?mode=dark for the same reason the lens takes one: a link can carry the view it was
  // written for. Not persisted — the override lasts the visit.
  const fromUrl = new URLSearchParams(window.location.search).get("mode");
  if (isMode(fromUrl)) return fromUrl;

  const saved = window.localStorage?.getItem(KEY);
  return isMode(saved) ? saved : DEFAULT_MODE;
}

export function saveMode(mode) {
  try {
    window.localStorage?.setItem(KEY, mode);
  } catch {
    // Private browsing or a blocked store: the choice just does not persist.
  }
}
