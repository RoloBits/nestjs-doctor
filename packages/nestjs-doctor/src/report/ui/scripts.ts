import APP_BUNDLE from "./app/bundle.iife.js?raw";
import BROWSER_BUNDLE from "./browser/bundle.iife.js?raw";
import { BOOT } from "./scripts/boot.js";
import { bootstrap } from "./scripts/bootstrap.js";
import { CHROME } from "./scripts/chrome.js";
import { DIAGNOSIS } from "./scripts/diagnosis.js";
import { ENDPOINTS } from "./scripts/endpoints.js";
import { LAB } from "./scripts/lab.js";
import { MODULES_GRAPH } from "./scripts/modules-graph.js";
import { SCHEMA } from "./scripts/schema.js";
import { SHARE } from "./scripts/share.js";
import { SHARED_TREE } from "./scripts/shared-tree.js";
import { TAB_VISIBILITY } from "./scripts/tab-visibility.js";

export function getReportScripts(artifactJson: string): string {
	// The chunks are emitted into one classic <script>, so this order is the
	// order the browser evaluates. BOOT runs switchTab and stays second to last.
	return [
		`\n${BROWSER_BUNDLE}`,
		`\n${APP_BUNDLE}`,
		bootstrap(artifactJson),
		CHROME,
		MODULES_GRAPH,
		DIAGNOSIS,
		SHARED_TREE,
		LAB,
		TAB_VISIBILITY,
		SCHEMA,
		ENDPOINTS,
		BOOT,
		SHARE,
	].join("");
}
