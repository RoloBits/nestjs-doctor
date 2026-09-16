import { existsSync, readFileSync } from "node:fs";
import { appendFile, cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { logger } from "../ui/logger.js";
import { isCommandAvailable } from "./ui/commands.js";

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

interface SkillTarget {
	detect: () => boolean;
	install: (skills: SkillContents) => Promise<void>;
	/** Whether the target's main skill carries this version's stamp. */
	installed: (version: string) => boolean;
	name: string;
}

const home = homedir();

const WINDSURF_RULES = join(
	home,
	".codeium",
	"windsurf",
	"memories",
	"global_rules.md"
);
const WINDSURF_START = "<!-- nestjs-doctor:start -->";
const WINDSURF_END = "<!-- nestjs-doctor:end -->";

const readOrEmpty = (file: string): string => {
	try {
		return readFileSync(file, "utf-8");
	} catch {
		return "";
	}
};

/** Whether the AGENTS.md under `<dir>/nestjs-doctor` carries this version's stamp. */
const hasSkill = (version: string, ...dir: string[]): boolean =>
	readOrEmpty(join(home, ...dir, "nestjs-doctor", "AGENTS.md")).includes(
		`> v${version}`
	);

/** Whether the managed block in Windsurf's rules file carries this version's stamp. */
const hasWindsurfBlock = (version: string): boolean => {
	const rules = readOrEmpty(WINDSURF_RULES);
	const from = rules.indexOf(WINDSURF_START);
	const to = rules.indexOf(WINDSURF_END);
	return (
		from !== -1 && to > from && rules.slice(from, to).includes(`> v${version}`)
	);
};

const SKILL_TARGETS: SkillTarget[] = [
	{
		name: "Claude Code",
		detect: () => existsSync(join(home, ".claude")),
		installed: (version) => hasSkill(version, ".claude", "skills"),
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
		installed: (version) => hasSkill(version, ".config", "amp", "skills"),
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
		installed: (version) => hasSkill(version, ".cursor", "skills"),
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
		installed: (version) => hasSkill(version, ".config", "opencode", "skills"),
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
		installed: hasWindsurfBlock,
		install: async (skills) => {
			const rulesPath = WINDSURF_RULES;
			const start = WINDSURF_START;
			const end = WINDSURF_END;
			const block = [
				start,
				toAgentsContent(skills.main.body),
				toAgentsContent(skills.createRule.body),
				toAgentsContent(skills.bootTrace.body),
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
		installed: (version) =>
			hasSkill(version, ".gemini", "antigravity", "skills"),
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
		installed: (version) => hasSkill(version, ".gemini", "skills"),
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
		installed: (version) => hasSkill(version, ".codex", "skills"),
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

/** True when every detected agent carries this version's skill. */
export const skillInstalledForDetectedAgent = (version: string): boolean =>
	SKILL_TARGETS.every(
		(target) => !target.detect() || target.installed(version)
	);

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
		if (!target.detect()) {
			continue;
		}

		try {
			await target.install(skills);
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
