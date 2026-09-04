import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import App from "./App.jsx";
import { movedPosition } from "./toc.js";
import "./app.css";

/*
 * A link written before a position moved into the fragment, corrected on the way in.
 *
 * `?to=` and `?at=` used to ride in the query, and links in that shape are pasted into
 * tasks and messages that outlive the change of shape. Both are read here and written back
 * where they now belong, so the page still opens on the heading or the scenario the link
 * was sent for.
 *
 * Before `createRoot` rather than in an effect: a page reads its position while it renders,
 * so an address corrected afterwards would be corrected too late for the one link this
 * exists to serve. `replaceState`, so the correction costs no history entry and one press
 * of back leaves the viewer rather than landing on the address it just rewrote.
 */
const moved = movedPosition(window.location);
if (moved)
  window.history.replaceState(
    null,
    "",
    `${window.location.pathname}${moved.search}${moved.hash}`,
  );

// `<Theme>` lives inside App rather than here, because the sidebar switches its mode and
// the whole tree — including the loading and error states — has to sit under it.
createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
