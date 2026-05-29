import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";
import { initContent } from "./game/content/index";

const rootEl = document.getElementById("root");
if (!rootEl) {
  throw new Error("Root element #root not found in document");
}

// Warm up card/hero/relic registry before first render so synchronous
// lookups in CombatScreen succeed without awaiting per-component loaders.
void initContent();

createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
