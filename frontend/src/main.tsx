import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./i18n"; // i18next 초기화 (App 렌더 전 실행)
import "./index.css";
import App from "./App.tsx";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
