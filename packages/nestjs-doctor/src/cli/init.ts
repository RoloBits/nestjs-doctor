import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import {
	BOOT_TRACE_SKILL_TEMPLATE,
	CREATE_RULE_SKILL_TEMPLATE,
	SKILL_TEMPLATE,
} from "./skill-content.js";
import { logger } from "./ui/logger.js";

const VERSION_LINE_RE = /^> v.+$/m;
const FRONTMATTER_RE = /^---\n[\s\S]*?\n---\n+/;

/** The skill body without its frontmatter, for agents that read AGENTS.md. */
const toAgentsContent = (skill: string): string =>
	skill.replace(FRONTMATTER_RE, "");

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

const writeAgentsOnly = async (
	directory: string,
	skillContent: string
): Promise<void> => {
	await mkdir(directory, { recursive: true });
	await writeFile(
		join(directory, "AGENTS.md"),
		toAgentsContent(skillContent),
		"utf-8"
	);
};

const writeSkillPair = async (
	directory: string,
	skillContent: string
): Promise<void> => {
	await mkdir(directory, { recursive: true });
	await writeFile(join(directory, "SKILL.md"), skillContent, "utf-8");
	await writeFile(
		join(directory, "AGENTS.md"),
		toAgentsContent(skillContent),
		"utf-8"
	);
};

interface SkillContents {
	bootTrace: string;
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
			await writeSkillPair(dir, skills.main);
			const createRuleDir = join(
				home,
				".claude",
				"skills",
				"nestjs-doctor-create-rule"
			);
			await writeSkillPair(createRuleDir, skills.createRule);
			const bootTraceDir = join(home, ".claude", "skills", "nestjs-boot-trace");
			await writeSkillPair(bootTraceDir, skills.bootTrace);
		},
	},
	{
		name: "Amp Code",
		detect: () => existsSync(join(home, ".amp")),
		install: async (skills) => {
			const dir = join(home, ".config", "amp", "skills", "nestjs-doctor");
			await writeAgentsOnly(dir, skills.main);
			const createRuleDir = join(
				home,
				".config",
				"amp",
				"skills",
				"nestjs-doctor-create-rule"
			);
			await writeAgentsOnly(createRuleDir, skills.createRule);
			const bootTraceDir = join(
				home,
				".config",
				"amp",
				"skills",
				"nestjs-boot-trace"
			);
			await writeAgentsOnly(bootTraceDir, skills.bootTrace);
		},
	},
	{
		name: "Cursor",
		detect: () => existsSync(join(home, ".cursor")),
		install: async (skills) => {
			const dir = join(home, ".cursor", "skills", "nestjs-doctor");
			await writeAgentsOnly(dir, skills.main);
			const createRuleDir = join(
				home,
				".cursor",
				"skills",
				"nestjs-doctor-create-rule"
			);
			await writeAgentsOnly(createRuleDir, skills.createRule);
			const bootTraceDir = join(home, ".cursor", "skills", "nestjs-boot-trace");
			await writeAgentsOnly(bootTraceDir, skills.bootTrace);
		},
	},
	{
		name: "OpenCode",
		detect: () =>
			isCommandAvailable("opencode") ||
			existsSync(join(home, ".config", "opencode")),
		install: async (skills) => {
			const dir = join(home, ".config", "opencode", "skills", "nestjs-doctor");
			await writeAgentsOnly(dir, skills.main);
			const createRuleDir = join(
				home,
				".config",
				"opencode",
				"skills",
				"nestjs-doctor-create-rule"
			);
			await writeAgentsOnly(createRuleDir, skills.createRule);
			const bootTraceDir = join(
				home,
				".config",
				"opencode",
				"skills",
				"nestjs-boot-trace"
			);
			await writeAgentsOnly(bootTraceDir, skills.bootTrace);
		},
	},
	{
		name: "Windsurf",
		detect: () =>
			existsSync(join(home, ".codeium")) ||
			existsSync(join(home, "Library", "Application Support", "Windsurf")),
		install: async (skills) => {
			const rulesPath = join(
				home,
				".codeium",
				"windsurf",
				"memories",
				"global_rules.md"
			);
			const start = "<!-- nestjs-doctor:start -->";
			const end = "<!-- nestjs-doctor:end -->";
			const block = [
				start,
				toAgentsContent(skills.main),
				toAgentsContent(skills.createRule),
				toAgentsContent(skills.bootTrace),
				end,
			].join("\n");

			if (existsSync(rulesPath)) {
				const existing = await readFile(rulesPath, "utf-8");
				const from = existing.indexOf(start);
				const to = existing.indexOf(end);
				if (from !== -1 && to > from) {
					const replaced =
						existing.slice(0, from) + block + existing.slice(to + end.length);
					await writeFile(rulesPath, replaced, "utf-8");
					return;
				}
				await appendFile(rulesPath, `\n${block}`, "utf-8");
			} else {
				await mkdir(join(home, ".codeium", "windsurf", "memories"), {
					recursive: true,
				});
				await writeFile(rulesPath, block, "utf-8");
			}
		},
	},
	{
		name: "Antigravity",
		detect: () =>
			isCommandAvailable("agy") ||
			existsSync(join(home, ".gemini", "antigravity")),
		install: async (skills) => {
			const dir = join(
				home,
				".gemini",
				"antigravity",
				"skills",
				"nestjs-doctor"
			);
			await writeAgentsOnly(dir, skills.main);
			const createRuleDir = join(
				home,
				".gemini",
				"antigravity",
				"skills",
				"nestjs-doctor-create-rule"
			);
			await writeAgentsOnly(createRuleDir, skills.createRule);
			const bootTraceDir = join(
				home,
				".gemini",
				"antigravity",
				"skills",
				"nestjs-boot-trace"
			);
			await writeAgentsOnly(bootTraceDir, skills.bootTrace);
		},
	},
	{
		name: "Gemini CLI",
		detect: () =>
			isCommandAvailable("gemini") || existsSync(join(home, ".gemini")),
		install: async (skills) => {
			const dir = join(home, ".gemini", "skills", "nestjs-doctor");
			await writeAgentsOnly(dir, skills.main);
			const createRuleDir = join(
				home,
				".gemini",
				"skills",
				"nestjs-doctor-create-rule"
			);
			await writeAgentsOnly(createRuleDir, skills.createRule);
			const bootTraceDir = join(home, ".gemini", "skills", "nestjs-boot-trace");
			await writeAgentsOnly(bootTraceDir, skills.bootTrace);
		},
	},
	{
		name: "Codex",
		detect: () =>
			isCommandAvailable("codex") || existsSync(join(home, ".codex")),
		install: async (skills) => {
			const dir = join(home, ".codex", "skills", "nestjs-doctor");
			await writeAgentsOnly(dir, skills.main);
			const createRuleDir = join(
				home,
				".codex",
				"skills",
				"nestjs-doctor-create-rule"
			);
			await writeAgentsOnly(createRuleDir, skills.createRule);
			const bootTraceDir = join(home, ".codex", "skills", "nestjs-boot-trace");
			await writeAgentsOnly(bootTraceDir, skills.bootTrace);

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

export const initSkill = async (
	targetPath: string,
	version: string
): Promise<void> => {
	const skills: SkillContents = {
		main: SKILL_TEMPLATE.replace(VERSION_LINE_RE, `> v${version}`),
		createRule: CREATE_RULE_SKILL_TEMPLATE.replace(
			VERSION_LINE_RE,
			`> v${version}`
		),
		bootTrace: BOOT_TRACE_SKILL_TEMPLATE.replace(
			VERSION_LINE_RE,
			`> v${version}`
		),
	};

	let installed = 0;

	for (const target of SKILL_TARGETS) {
		if (!target.detect()) {
			continue;
		}

		try {
			await target.install(skills);
			logger.success(`Installed 3 skills for ${target.name}`);
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
	const bootTraceProjectDir = join(targetPath, ".agents", "nestjs-boot-trace");
	try {
		await writeSkillPair(projectDir, skills.main);
		await writeSkillPair(createRuleProjectDir, skills.createRule);
		await writeSkillPair(bootTraceProjectDir, skills.bootTrace);
		logger.success("Installed 3 skills to .agents/");
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
