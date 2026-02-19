import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join } from "node:path";
import { logger } from "./output/logger.js";

const SKILL_DIR = ".claude/skills/nestjs-doctor";
const SKILL_FILE = "SKILL.md";
const VERSION_LINE_RE = /^> v.+$/m;

export const initSkill = async (targetPath: string): Promise<void> => {
	const skillDir = join(targetPath, SKILL_DIR);
	const skillPath = join(skillDir, SKILL_FILE);

	const existed = existsSync(skillPath);

	const require = createRequire(import.meta.url);
	const templatePath = require.resolve("../../skill/SKILL.md");
	const template = await readFile(templatePath, "utf-8");

	const pkgPath = require.resolve("../../package.json");
	const pkg = JSON.parse(await readFile(pkgPath, "utf-8")) as {
		version: string;
	};
	const { version } = pkg;

	const content = template.replace(VERSION_LINE_RE, `> v${version}`);

	await mkdir(skillDir, { recursive: true });
	await writeFile(skillPath, content, "utf-8");

	if (existed) {
		logger.success(`Updated ${SKILL_DIR}/${SKILL_FILE} to v${version}`);
	} else {
		logger.success(
			`Created ${SKILL_DIR}/${SKILL_FILE} — use /nestjs-doctor in Claude Code to scan and fix your NestJS project.`
		);
	}
};
