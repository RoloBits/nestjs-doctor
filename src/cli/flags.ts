import type { ArgsDef } from "citty";

export const flags = {
	verbose: {
		type: "boolean",
		description: "Show file paths and line numbers per diagnostic",
		default: false,
	},
	score: {
		type: "boolean",
		description: "Output only the numeric score (for CI)",
		default: false,
	},
	json: {
		type: "boolean",
		description: "JSON output",
		default: false,
	},
	config: {
		type: "string",
		description: "Config file path",
	},
} satisfies ArgsDef;
