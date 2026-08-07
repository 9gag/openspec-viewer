import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import App from "./App.jsx";
import "./app.css";

// `<Theme>` lives inside App rather than here, because the sidebar switches its mode and
// the whole tree — including the loading and error states — has to sit under it.
createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
