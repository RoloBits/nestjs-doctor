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

const CREATE_RULE_AGENTS_CONTENT = `# NestJS Doctor — Create Custom Rule

Generate custom nestjs-doctor rules that detect project-specific patterns and anti-patterns. Guides you through writing a valid rule file with ts-morph AST patterns, configuring the project, and verifying the rule loads.

## Usage

\`\`\`bash
# After creating a rule, verify it loads:
npx nestjs-doctor@latest . --json
\`\`\`

## Workflow

1. Describe the pattern to detect
2. Choose scope (file or project), category, and severity
3. Generate the rule file in the custom rules directory
4. Update nestjs-doctor config with \`customRulesDir\`
5. Run nestjs-doctor to verify the rule loads
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

const writeCreateRuleSkillFiles = async (directory: string): Promise<void> => {
	await mkdir(directory, { recursive: true });
	await writeFile(
		join(directory, "AGENTS.md"),
		CREATE_RULE_AGENTS_CONTENT,
		"utf-8"
	);
};

const writeCreateRuleSkillFilesWithTemplate = async (
	directory: string,
	skillContent: string
): Promise<void> => {
	await mkdir(directory, { recursive: true });
	await writeFile(join(directory, "SKILL.md"), skillContent, "utf-8");
	await writeFile(
		join(directory, "AGENTS.md"),
		CREATE_RULE_AGENTS_CONTENT,
		"utf-8"
	);
};

interface SkillContents {
	createRule: string;
	main: string;
}

interface SkillTarget {
	detect: () => boolean;
	install: (skills: SkillContents) => Promise<void>;
	name: string;
}

const home = homedir();

const SKILL_TARGETS: SkillTarget[] = [
	{
		name: "Claude Code",
		detect: () => existsSync(join(home, ".claude")),
		install: async (skills) => {
			const dir = join(home, ".claude", "skills", "nestjs-doctor");
			await writeSkillFilesWithTemplate(dir, skills.main);
			const createRuleDir = join(
				home,
				".claude",
				"skills",
				"nestjs-doctor-create-rule"
			);
			await writeCreateRuleSkillFilesWithTemplate(
				createRuleDir,
				skills.createRule
			);
		},
	},
	{
		name: "Amp Code",
		detect: () => existsSync(join(home, ".amp")),
		install: async () => {
			const dir = join(home, ".config", "amp", "skills", "nestjs-doctor");
			await writeSkillFiles(dir);
			const createRuleDir = join(
				home,
				".config",
				"amp",
				"skills",
				"nestjs-doctor-create-rule"
			);
			await writeCreateRuleSkillFiles(createRuleDir);
		},
	},
	{
		name: "Cursor",
		detect: () => existsSync(join(home, ".cursor")),
		install: async () => {
			const dir = join(home, ".cursor", "skills", "nestjs-doctor");
			await writeSkillFiles(dir);
			const createRuleDir = join(
				home,
				".cursor",
				"skills",
				"nestjs-doctor-create-rule"
			);
			await writeCreateRuleSkillFiles(createRuleDir);
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
			const createRuleDir = join(
				home,
				".config",
				"opencode",
				"skills",
				"nestjs-doctor-create-rule"
			);
			await writeCreateRuleSkillFiles(createRuleDir);
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
			const combinedContent = AGENTS_CONTENT + CREATE_RULE_AGENTS_CONTENT;

			if (existsSync(rulesPath)) {
				const existing = await readFile(rulesPath, "utf-8");
				if (existing.includes(marker)) {
					return;
				}
				await appendFile(rulesPath, `\n${combinedContent}`, "utf-8");
			} else {
				await mkdir(join(home, ".codeium", "windsurf", "memories"), {
					recursive: true,
				});
				await writeFile(rulesPath, combinedContent, "utf-8");
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
			const createRuleDir = join(
				home,
				".gemini",
				"antigravity",
				"skills",
				"nestjs-doctor-create-rule"
			);
			await writeCreateRuleSkillFiles(createRuleDir);
		},
	},
	{
		name: "Gemini CLI",
		detect: () =>
			isCommandAvailable("gemini") || existsSync(join(home, ".gemini")),
		install: async () => {
			const dir = join(home, ".gemini", "skills", "nestjs-doctor");
			await writeSkillFiles(dir);
			const createRuleDir = join(
				home,
				".gemini",
				"skills",
				"nestjs-doctor-create-rule"
			);
			await writeCreateRuleSkillFiles(createRuleDir);
		},
	},
	{
		name: "Codex",
		detect: () =>
			isCommandAvailable("codex") || existsSync(join(home, ".codex")),
		install: async () => {
			const dir = join(home, ".codex", "skills", "nestjs-doctor");
			await writeSkillFiles(dir);
			const createRuleDir = join(
				home,
				".codex",
				"skills",
				"nestjs-doctor-create-rule"
			);
			await writeCreateRuleSkillFiles(createRuleDir);

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

	const createRuleTemplatePath = require.resolve(
		"../../skill/CREATE-RULE-SKILL.md"
	);
	const createRuleTemplate = await readFile(createRuleTemplatePath, "utf-8");

	const pkgPath = require.resolve("../../package.json");
	const pkg = JSON.parse(await readFile(pkgPath, "utf-8")) as {
		version: string;
	};
	const { version } = pkg;

	const skills: SkillContents = {
		main: template.replace(VERSION_LINE_RE, `> v${version}`),
		createRule: createRuleTemplate.replace(VERSION_LINE_RE, `> v${version}`),
	};

	let installed = 0;

	for (const target of SKILL_TARGETS) {
		if (!target.detect()) {
			continue;
		}

		try {
			await target.install(skills);
			logger.success(`Installed 2 skills for ${target.name}`);
			installed++;
		} catch {
			logger.error(`Failed to install skills for ${target.name}`);
		}
	}

	// Project-level fallback
	const projectDir = join(targetPath, ".agents", "nestjs-doctor");
	const createRuleProjectDir = join(
		targetPath,
		".agents",
		"nestjs-doctor-create-rule"
	);
	try {
		await writeSkillFilesWithTemplate(projectDir, skills.main);
		await writeCreateRuleSkillFilesWithTemplate(
			createRuleProjectDir,
			skills.createRule
		);
		logger.success("Installed 2 skills to .agents/");
		installed++;
	} catch {
		logger.error("Failed to install skills to .agents/");
	}

	if (installed === 0) {
		logger.warn(
			"No AI coding agents detected. Skill files were written to .agents/ only."
		);
	} else {
		logger.break();
		logger.dim(
			`Installed nestjs-doctor v${version} skills for ${installed} target${installed === 1 ? "" : "s"}.`
		);
	}
};
