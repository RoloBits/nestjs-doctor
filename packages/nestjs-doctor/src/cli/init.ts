import { existsSync } from "node:fs";
import { appendFile, cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { logger } from "../ui/logger.js";
import {
	SKILL_TARGETS,
	type SkillTargetName,
	WINDSURF_END,
	WINDSURF_START,
	windsurfRulesPath,
} from "./skill-targets.js";

// The build copies skills/ to dist/skills. Which directory the bundled entry
// reports depends on how it was chunked, so both places are tried.
const MODULE_DIR = dirname(fileURLToPath(import.meta.url));
const SKILL_ROOTS = [
	join(MODULE_DIR, "skills"),
	join(MODULE_DIR, "..", "skills"),
];

const skillFile = (name: string): string => {
	const root =
		SKILL_ROOTS.find((candidate) =>
			existsSync(join(candidate, name, "SKILL.md"))
		) ?? SKILL_ROOTS[0];
	return join(root, name, "SKILL.md");
};

const VERSION_LINE_RE = /^> v.+$/m;
const FRONTMATTER_RE = /^---\n[\s\S]*?\n---\n+/;

/** The skill body without its frontmatter, for agents that read AGENTS.md. */
const toAgentsContent = (skill: string): string =>
	skill.replace(FRONTMATTER_RE, "");

const CODEX_AGENT_CONFIG = `interface:
  display_name: "nestjs-doctor"
  short_description: "Diagnose and fix NestJS codebase health issues"
`;

const writeAgentsOnly = async (
	directory: string,
	skill: Skill
): Promise<void> => {
	await mkdir(directory, { recursive: true });
	await writeFile(
		join(directory, "AGENTS.md"),
		toAgentsContent(skill.body),
		"utf-8"
	);
};

const writeSkillPair = async (
	directory: string,
	skill: Skill
): Promise<void> => {
	await mkdir(directory, { recursive: true });
	await writeFile(join(directory, "SKILL.md"), skill.body, "utf-8");
	await writeFile(
		join(directory, "AGENTS.md"),
		toAgentsContent(skill.body),
		"utf-8"
	);
	const references = join(skill.source, "references");
	if (existsSync(references)) {
		await cp(references, join(directory, "references"), { recursive: true });
	}
};

interface Skill {
	body: string;
	source: string;
}

interface SkillContents {
	bootTrace: Skill;
	createRule: Skill;
	main: Skill;
}

type Installer = (skills: SkillContents) => Promise<void>;

const home = homedir();
const WINDSURF_RULES = windsurfRulesPath(home);

/** One installer per shared target, keyed by the name the probe table uses. */
const INSTALLERS: Record<SkillTargetName, Installer> = {
	"Claude Code": async (skills) => {
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
	"Amp Code": async (skills) => {
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
	Cursor: async (skills) => {
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
	OpenCode: async (skills) => {
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
	Windsurf: async (skills) => {
		const block = [
			WINDSURF_START,
			toAgentsContent(skills.main.body),
			toAgentsContent(skills.createRule.body),
			toAgentsContent(skills.bootTrace.body),
			WINDSURF_END,
		].join("\n");

		if (existsSync(WINDSURF_RULES)) {
			const existing = await readFile(WINDSURF_RULES, "utf-8");
			const from = existing.indexOf(WINDSURF_START);
			const to = existing.indexOf(WINDSURF_END);
			if (from !== -1 && to > from) {
				const replaced =
					existing.slice(0, from) +
					block +
					existing.slice(to + WINDSURF_END.length);
				await writeFile(WINDSURF_RULES, replaced, "utf-8");
				return;
			}
			await appendFile(WINDSURF_RULES, `\n${block}`, "utf-8");
		} else {
			await mkdir(dirname(WINDSURF_RULES), { recursive: true });
			await writeFile(WINDSURF_RULES, block, "utf-8");
		}
	},
	Antigravity: async (skills) => {
		const dir = join(home, ".gemini", "antigravity", "skills", "nestjs-doctor");
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
	"Gemini CLI": async (skills) => {
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
	Codex: async (skills) => {
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
};

/** Sink for the install's progress lines. */
export type InitReporter = Pick<
	typeof logger,
	"dim" | "error" | "success" | "warn"
>;

/** Installs the skills everywhere they fit and returns how many targets took them. */
export const initSkill = async (
	targetPath: string,
	version: string,
	out: InitReporter = logger
): Promise<number> => {
	const read = async (name: string): Promise<Skill> => {
		const file = skillFile(name);
		const body = await readFile(file, "utf-8");
		return {
			body: body.replace(VERSION_LINE_RE, `> v${version}`),
			source: dirname(file),
		};
	};

	let skills: SkillContents;
	try {
		skills = {
			bootTrace: await read("nestjs-boot-trace"),
			createRule: await read("nestjs-doctor-create-rule"),
			main: await read("nestjs-doctor"),
		};
	} catch {
		out.error(
			`Could not read the skill sources at ${SKILL_ROOTS[0]}. Reinstall nestjs-doctor.`
		);
		return 0;
	}

	let installed = 0;

	for (const target of SKILL_TARGETS) {
		if (!target.detect(home)) {
			continue;
		}

		try {
			await INSTALLERS[target.name](skills);
			out.success(`Installed 3 skills for ${target.name}`);
			installed++;
		} catch {
			out.error(`Failed to install skills for ${target.name}`);
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
		out.success("Installed 3 skills to .agents/");
		installed++;
	} catch {
		out.error("Failed to install skills to .agents/");
	}

	if (installed === 0) {
		out.warn(
			"No AI coding agents detected. Skill files were written to .agents/ only."
		);
	} else {
		out.dim("");
		out.dim(
			`Installed nestjs-doctor v${version} skills for ${installed} target${installed === 1 ? "" : "s"}.`
		);
	}
	return installed;
};
