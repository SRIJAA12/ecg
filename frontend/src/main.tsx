/**
 * src/main.tsx
 * ============
 * React application entry point.
 *
 * Responsibilities (one only):
 *   - Import global CSS (must be first — establishes design tokens for all components)
 *   - Mount the React application into #root
 *
 * Why StrictMode?
 *   React.StrictMode intentionally renders components twice in development.
 *   This catches side effects that should only run once (e.g., misused useEffect).
 *   It has ZERO impact on production builds.
 *   For a medical simulation project, strict mode is mandatory — it helps
 *   catch bugs that could cause incorrect clinical display behavior.
 */

// Global CSS must be the very first import.
// Vite processes this and injects it before any component styles.
import "@/styles/index.css";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "@/App";

// Locate the #root DOM node defined in index.html
const rootElement = document.getElementById("root");

if (!rootElement) {
  // This should never happen if index.html is correct.
  // We throw rather than silently fail — fail fast is correct for medical software.
  throw new Error(
    "[main.tsx] Could not find #root element in the DOM. " +
    "Check that index.html contains <div id=\"root\"></div>."
  );
}

// createRoot is the React 18/19 API for concurrent rendering.
// It replaces the old ReactDOM.render() which is now deprecated.
createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>
);
