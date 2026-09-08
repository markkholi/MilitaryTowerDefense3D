import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import MilitaryTowerDefense from "./game-client";
import "./globals.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode><MilitaryTowerDefense /></StrictMode>,
);
