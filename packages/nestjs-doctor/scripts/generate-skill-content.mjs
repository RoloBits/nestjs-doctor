#!/usr/bin/env node
// Turns skills/<name>/SKILL.md into src/cli/skill-content.ts, which the bundle
// inlines. Run with --check to fail instead of writing.
import { readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const SKILLS_DIR = join(root, "skills");
const TARGET = join(root, "src", "cli", "skill-content.ts");

/** Skill directory to the constant the CLI imports. */
const EXPORTS = {
	"nestjs-doctor": "SKILL_TEMPLATE",
	"nestjs-boot-trace": "BOOT_TRACE_SKILL_TEMPLATE",
	"nestjs-doctor-create-rule": "CREATE_RULE_SKILL_TEMPLATE",
};

const HEADER = `// Generated from skills/<name>/SKILL.md by scripts/generate-skill-content.mjs.
// Edit the markdown, then run \`pnpm generate:skills\`.
`;

const escapeForTemplate = (text) =>
	text.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$\{/g, "\\${");

const build = async () => {
	const dirs = (await readdir(SKILLS_DIR, { withFileTypes: true }))
		.filter((entry) => entry.isDirectory())
		.map((entry) => entry.name)
		.sort();

	const missing = dirs.filter((dir) => !EXPORTS[dir]);
	if (missing.length > 0) {
		throw new Error(
			`skills/${missing.join(", ")} has no export name in generate-skill-content.mjs`
		);
	}
	const absent = Object.keys(EXPORTS).filter((dir) => !dirs.includes(dir));
	if (absent.length > 0) {
		throw new Error(`Expected skills/${absent.join(", ")} to exist`);
	}

	const blocks = [];
	for (const dir of dirs) {
		const body = await readFile(join(SKILLS_DIR, dir, "SKILL.md"), "utf-8");
		if (!body.includes("> v0.0.0")) {
			throw new Error(`skills/${dir}/SKILL.md needs a "> v0.0.0" version line`);
		}
		blocks.push(
			`export const ${EXPORTS[dir]} = \`${escapeForTemplate(body)}\`;\n`
		);
	}
	return `${HEADER}\n${blocks.join("\n")}`;
};

const generated = await build();

if (process.argv.includes("--check")) {
	const current = await readFile(TARGET, "utf-8").catch(() => "");
	if (current !== generated) {
		process.stderr.write(
			"skill-content.ts is out of date. Run `pnpm generate:skills`.\n"
		);
		process.exit(1);
	}
	process.stdout.write("skill-content.ts matches skills/\n");
} else {
	await writeFile(TARGET, generated, "utf-8");
	process.stdout.write(`Wrote ${TARGET}\n`);
}
