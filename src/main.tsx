import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { ThemeProvider } from "@/core/theme/ThemeProvider";
import { initTheme } from "@/core/theme/theme";
import "@fontsource-variable/inter/index.css";
import "streamdown/styles.css";
import "./styles/global.css";

initTheme();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </React.StrictMode>,
);
