import "./tailwind.css";
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { pdfjs } from "react-pdf";

// Configure pdfjs worker globally for the whole app
pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";


ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
