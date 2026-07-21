import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AppView } from "./features/app/AppView.js";
import { useAppController } from "./features/app/useAppController.js";
import { applyThemePreference, readThemePreference } from "./lib/theme.js";
import "./styles/theme.css";
import "./styles/app.css";
import "./styles/grid.css";
import "./styles/admin.css";
import "./styles/overlays.css";
import "./styles/product.css";

applyThemePreference(readThemePreference(), window.matchMedia("(prefers-color-scheme: dark)").matches);

function App() {
  const controller = useAppController();
  return <AppView controller={controller} />;
}

createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>
);
