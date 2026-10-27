import React from "react";
import ReactDOM from "react-dom/client";
import { DataProvider } from "./state";
import { App } from "./App";
import "./styles.css";
import { FocusRuntime } from "./components/FocusRuntime";
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <DataProvider>
      <FocusRuntime />
      <App />
    </DataProvider>
  </React.StrictMode>,
);
