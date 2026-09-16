import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const SKILLS = resolve(import.meta.dirname, "../../skills");
const COMMAND_LINE = /^\s*(?:\S+=\S+\s+)*npx nestjs-doctor\b.*$/gm;
const PREFIXED = /^\s*NESTJS_DOCTOR_TRIGGER=skill npx nestjs-doctor\b/;

describe("shipped skills", () => {
	it("stamp every nestjs-doctor command as a skill run", () => {
		const dirs = readdirSync(SKILLS);
		expect(dirs.length).toBeGreaterThan(0);

		for (const dir of dirs) {
			const body = readFileSync(join(SKILLS, dir, "SKILL.md"), "utf-8");
			const commands = body.match(COMMAND_LINE) ?? [];
			expect(commands.length, `${dir} runs the CLI`).toBeGreaterThan(0);
			for (const command of commands) {
				expect(command, `${dir}: ${command.trim()}`).toMatch(PREFIXED);
			}
		}
	});
});
