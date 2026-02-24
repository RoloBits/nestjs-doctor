import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { join } from "node:path";
import { logger } from "./output/logger.js";

const VERSION_LINE_RE = /^> v.+$/m;

const AGENTS_CONTENT = `# NestJS Doctor

Diagnose and fix NestJS codebase health issues. Scans for security, performance, correctness, and architecture issues. Outputs a 0-100 score with actionable diagnostics.

## Usage

\`\`\`bash
npx nestjs-doctor@latest . --verbose --json
\`\`\`

## Workflow

Run after making changes to catch issues early. Fix errors first (security > correctness > architecture > performance), then re-run to verify the score improved.
`;

const CODEX_AGENT_CONFIG = `interface:
  display_name: "nestjs-doctor"
  short_description: "Diagnose and fix NestJS codebase health issues"
`;

const isCommandAvailable = (command: string): boolean => {
	try {
		const cmd =
			process.platform === "win32" ? `where ${command}` : `which ${command}`;
		execSync(cmd, { stdio: "ignore" });
		return true;
	} catch {
		return false;
	}
};

const writeSkillFiles = async (directory: string): Promise<void> => {
	await mkdir(directory, { recursive: true });
	await writeFile(join(directory, "AGENTS.md"), AGENTS_CONTENT, "utf-8");
};

const writeSkillFilesWithTemplate = async (
	directory: string,
	skillContent: string
): Promise<void> => {
	await mkdir(directory, { recursive: true });
	await writeFile(join(directory, "SKILL.md"), skillContent, "utf-8");
	await writeFile(join(directory, "AGENTS.md"), AGENTS_CONTENT, "utf-8");
};

interface SkillTarget {
	detect: () => boolean;
	install: (skillContent: string) => Promise<void>;
	name: string;
}

const home = homedir();

const SKILL_TARGETS: SkillTarget[] = [
	{
		name: "Claude Code",
		detect: () => existsSync(join(home, ".claude")),
		install: async (skillContent) => {
			const dir = join(home, ".claude", "skills", "nestjs-doctor");
			await writeSkillFilesWithTemplate(dir, skillContent);
		},
	},
	{
		name: "Amp Code",
		detect: () => existsSync(join(home, ".amp")),
		install: async () => {
			const dir = join(home, ".config", "amp", "skills", "nestjs-doctor");
			await writeSkillFiles(dir);
		},
	},
	{
		name: "Cursor",
		detect: () => existsSync(join(home, ".cursor")),
		install: async () => {
			const dir = join(home, ".cursor", "skills", "nestjs-doctor");
			await writeSkillFiles(dir);
		},
	},
	{
		name: "OpenCode",
		detect: () =>
			isCommandAvailable("opencode") ||
			existsSync(join(home, ".config", "opencode")),
		install: async () => {
			const dir = join(home, ".config", "opencode", "skills", "nestjs-doctor");
			await writeSkillFiles(dir);
		},
	},
	{
		name: "Windsurf",
		detect: () =>
			existsSync(join(home, ".codeium")) ||
			existsSync(join(home, "Library", "Application Support", "Windsurf")),
		install: async () => {
			const rulesPath = join(
				home,
				".codeium",
				"windsurf",
				"memories",
				"global_rules.md"
			);
			const marker = "# NestJS Doctor";

			if (existsSync(rulesPath)) {
				const existing = await readFile(rulesPath, "utf-8");
				if (existing.includes(marker)) {
					return;
				}
				await appendFile(rulesPath, `\n${AGENTS_CONTENT}`, "utf-8");
			} else {
				await mkdir(join(home, ".codeium", "windsurf", "memories"), {
					recursive: true,
				});
				await writeFile(rulesPath, AGENTS_CONTENT, "utf-8");
			}
		},
	},
	{
		name: "Antigravity",
		detect: () =>
			isCommandAvailable("agy") ||
			existsSync(join(home, ".gemini", "antigravity")),
		install: async () => {
			const dir = join(
				home,
				".gemini",
				"antigravity",
				"skills",
				"nestjs-doctor"
			);
			await writeSkillFiles(dir);
		},
	},
	{
		name: "Gemini CLI",
		detect: () =>
			isCommandAvailable("gemini") || existsSync(join(home, ".gemini")),
		install: async () => {
			const dir = join(home, ".gemini", "skills", "nestjs-doctor");
			await writeSkillFiles(dir);
		},
	},
	{
		name: "Codex",
		detect: () =>
			isCommandAvailable("codex") || existsSync(join(home, ".codex")),
		install: async () => {
			const dir = join(home, ".codex", "skills", "nestjs-doctor");
			await writeSkillFiles(dir);

			const agentsDir = join(home, ".codex", "agents");
			await mkdir(agentsDir, { recursive: true });
			await writeFile(
				join(agentsDir, "openai.yaml"),
				CODEX_AGENT_CONFIG,
				"utf-8"
			);
		},
	},
];

export const initSkill = async (targetPath: string): Promise<void> => {
	const require = createRequire(import.meta.url);

	const templatePath = require.resolve("../../skill/SKILL.md");
	const template = await readFile(templatePath, "utf-8");

	const pkgPath = require.resolve("../../package.json");
	const pkg = JSON.parse(await readFile(pkgPath, "utf-8")) as {
		version: string;
	};
	const { version } = pkg;

	const skillContent = template.replace(VERSION_LINE_RE, `> v${version}`);

	let installed = 0;

	for (const target of SKILL_TARGETS) {
		if (!target.detect()) {
			continue;
		}

		try {
			await target.install(skillContent);
			logger.success(`Installed skill for ${target.name}`);
			installed++;
		} catch {
			logger.error(`Failed to install skill for ${target.name}`);
		}
	}

	// Project-level fallback
	const projectDir = join(targetPath, ".agents", "nestjs-doctor");
	try {
		await writeSkillFilesWithTemplate(projectDir, skillContent);
		logger.success("Installed skill to .agents/nestjs-doctor/");
		installed++;
	} catch {
		logger.error("Failed to install skill to .agents/nestjs-doctor/");
	}

	if (installed === 0) {
		logger.warn(
			"No AI coding agents detected. Skill files were written to .agents/nestjs-doctor/ only."
		);
	} else {
		logger.break();
		logger.dim(
			`Installed nestjs-doctor v${version} skill for ${installed} target${installed === 1 ? "" : "s"}.`
		);
	}
};
