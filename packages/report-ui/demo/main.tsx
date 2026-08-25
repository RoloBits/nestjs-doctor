import { createRoot } from "react-dom/client";
import { App } from "../src/app";
import { fixtureModel } from "./fixture";

import "../src/styles/report.css";

const container = document.getElementById("root");
if (!container) {
	throw new Error("missing #root");
}

createRoot(container).render(<App model={fixtureModel()} />);
