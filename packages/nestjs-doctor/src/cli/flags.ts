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
	"min-score": {
		type: "string",
		description:
			"Minimum passing score (0-100). Exits with code 1 if below threshold",
	},
	config: {
		type: "string",
		description: "Config file path",
	},
	report: {
		type: "boolean",
		alias: "graph",
		description:
			"Generate an interactive HTML report (summary, diagnostics, module graph, rule lab)",
		default: false,
	},
	init: {
		type: "boolean",
		description:
			"Set up the nestjs-doctor skill for AI coding agents (Claude Code, Cursor, Codex, etc.)",
		default: false,
	},
} satisfies ArgsDef;
