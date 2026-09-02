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
	format: {
		type: "string",
		description:
			"Output format: console (default), json, report-json, sarif, gitlab, markdown, github",
	},
	output: {
		type: "string",
		description:
			"Write the output to a file instead of stdout; with --report, where the HTML goes",
	},
	"json-compact": {
		type: "boolean",
		description: "Emit JSON-based formats without indentation",
		default: false,
	},
	scope: {
		type: "string",
		description:
			"What to report: full (default), files (changed files), lines (changed lines), changed (introduced by the change)",
	},
	base: {
		type: "string",
		description: "Git ref to compare against for --scope (auto-detected)",
	},
	staged: {
		type: "boolean",
		description: "Scope to the staged files, for pre-commit hooks",
		default: false,
	},
	"changed-files-from": {
		type: "string",
		description:
			"Path to a newline-separated list of changed files to scope to (for CI)",
	},
	blocking: {
		type: "string",
		description:
			"Severity that fails the run: none, warning, or error (default: error; none with --json/--score)",
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
			"Generate an interactive HTML report (summary, diagnostics, module graph, rule lab); writes beside the project unless --output names a path",
		default: false,
	},
	telemetry: {
		type: "boolean",
		description:
			"Report anonymously after a scan: which built-in rules fired, the score, well-known dependencies, the config's shape, the scope and blocking level you ran with, and in CI how the run was triggered plus a one-way hash of the repository id. Never your code, paths, project name, or custom rule names. See https://nestjs.doctor/docs/telemetry",
		negativeDescription:
			'Scan and generate the report without reporting anything; DO_NOT_TRACK=1 and "telemetry": false in the config do the same, and NESTJS_DOCTOR_TELEMETRY_DEBUG=1 prints the payload instead of sending it',
		default: true,
	},
	timings: {
		type: "string",
		description:
			"Comma list of SerializedGraph JSON dumps (from app.get(SerializedGraph)), one per entry point, each optionally labelled as name=path; relative paths resolve against the scanned directory",
	},
	sources: {
		type: "string",
		description:
			"How much source text the report embeds: all (default), touched (only files with findings), none",
	},
	"share-sections": {
		type: "string",
		description:
			"Write a shareable nestjs-doctor-shared.json beside the project, limited to these comma-separated sections: score, endpoints, schema, modules, findings:<category> (e.g. findings:security)",
	},
	"share-code": {
		type: "boolean",
		description:
			"With --share-sections, include a few lines of code around each shared finding",
		default: false,
	},
	init: {
		type: "boolean",
		description:
			"Set up the nestjs-doctor skill for AI coding agents (Claude Code, Cursor, Codex, etc.)",
		default: false,
	},
	force: {
		type: "boolean",
		description: "Overwrite an existing file (with `ci install`)",
		default: false,
	},
	"list-rules": {
		type: "boolean",
		description: "List every built-in rule and exit",
		default: false,
	},
} satisfies ArgsDef;
