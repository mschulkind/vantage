import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "./index.css";
import App from "./App.tsx";
import { initStaticMode, getStaticBasePath } from "./lib/staticMode";

// Initialize static mode interceptor before any API calls
initStaticMode();

// In static mode, the app may be deployed under a subpath (e.g. /docs/).
// React Router needs the basename to strip it from the URL.
const basename = getStaticBasePath().replace(/\/$/, "") || "/";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter basename={basename}>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
