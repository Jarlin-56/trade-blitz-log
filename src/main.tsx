import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import QuickNoteWidget from "./components/QuickNoteWidget.tsx";
import "./index.css";

const isWidget = new URLSearchParams(window.location.search).get("mode") === "widget";

createRoot(document.getElementById("root")!).render(
  isWidget ? <QuickNoteWidget /> : <App />
);
