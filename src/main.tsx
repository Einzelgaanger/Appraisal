import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { bootSidebarChrome } from "./lib/sidebarChrome";
import "./index.css";

bootSidebarChrome();
createRoot(document.getElementById("root")!).render(<App />);
