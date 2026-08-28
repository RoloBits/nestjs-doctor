import APP_BUNDLE from "./app/bundle.iife.js?raw";
import { BOOT } from "./scripts/boot.js";
import { bootstrap } from "./scripts/bootstrap.js";
import { CHROME } from "./scripts/chrome.js";

export function getReportScripts(artifactJson: string): string {
	// The chunks are emitted into one classic <script>, so this order is the
	// order the browser evaluates. BOOT runs switchTab and stays second to last.
	return [`\n${APP_BUNDLE}`, bootstrap(artifactJson), CHROME, BOOT].join("");
}
