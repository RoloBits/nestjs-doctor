import { configDir } from "./install-id.js";

/**
 * Shown once per machine, on stderr so a machine-readable stdout stays
 * parseable. Printed before the first scan reports anything.
 */
export function firstRunNotice(): string {
	return [
		"nestjs-doctor reports anonymous usage so the rule set can be improved.",
		"It sends which built-in rules fired, the score, and which well-known",
		"packages you depend on (NestJS, ORM, database, cloud) — matched against a",
		"fixed list, so your own dependencies are never named. Never your code,",
		"file paths, project name, or custom rule names.",
		"",
		'Turn it off with --no-telemetry, DO_NOT_TRACK=1, or "telemetry": false in',
		`your config. Settings live in ${configDir()}.`,
	].join("\n");
}
