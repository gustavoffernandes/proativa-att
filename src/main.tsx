import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Apply saved theme immediately to avoid flash
(function() {
  const saved = localStorage.getItem("proativa-theme") || "system";
  const root = document.documentElement;
  if (saved === "dark") {
    root.classList.add("dark");
  } else if (saved === "system") {
    if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
      root.classList.add("dark");
    }
  }
  // Apply font size
  const fs = localStorage.getItem("proativa-fontsize");
  if (fs === "large") root.style.fontSize = "18px";
})();

createRoot(document.getElementById("root")!).render(<App />);
