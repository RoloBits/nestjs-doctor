import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join } from "node:path";
import { logger } from "./output/logger.js";

const SKILL_DIR = ".claude/skills/nestjs-doctor";
const SKILL_FILE = "SKILL.md";

export const initSkill = async (targetPath: string): Promise<void> => {
	const skillDir = join(targetPath, SKILL_DIR);
	const skillPath = join(skillDir, SKILL_FILE);

	if (existsSync(skillPath)) {
		logger.info(`${SKILL_DIR}/${SKILL_FILE} already exists — skipping.`);
		return;
	}

	const require = createRequire(import.meta.url);
	const templatePath = require.resolve("../../skill/SKILL.md");
	const template = await readFile(templatePath, "utf-8");

	await mkdir(skillDir, { recursive: true });
	await writeFile(skillPath, template, "utf-8");

	logger.success(
		`Created ${SKILL_DIR}/${SKILL_FILE} — use /nestjs-doctor in Claude Code to scan and fix your NestJS project.`
	);
};
