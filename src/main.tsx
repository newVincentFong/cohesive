import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "@fontsource-variable/inter/index.css";
import "streamdown/styles.css";
import "./styles/global.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
