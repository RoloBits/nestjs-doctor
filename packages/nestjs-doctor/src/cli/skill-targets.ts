import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { isCommandAvailable } from "./ui/commands.js";

export const WINDSURF_START = "<!-- nestjs-doctor:start -->";
export const WINDSURF_END = "<!-- nestjs-doctor:end -->";

/** Windsurf keeps one rules file instead of a skills directory. */
export const windsurfRulesPath = (home: string): string =>
	join(home, ".codeium", "windsurf", "memories", "global_rules.md");

const readOrEmpty = (file: string): string => {
	try {
		return readFileSync(file, "utf-8");
	} catch {
		return "";
	}
};

/** The AGENTS.md under `<dir>/nestjs-doctor`: present, and stamped with `version` when one is given. */
const hasSkill = (dir: string, version?: string): boolean => {
	const file = join(dir, "nestjs-doctor", "AGENTS.md");
	return version === undefined
		? existsSync(file)
		: readOrEmpty(file).includes(`> v${version}`);
};

/** The managed block in Windsurf's rules file: present, and stamped with `version` when one is given. */
const hasWindsurfBlock = (home: string, version?: string): boolean => {
	const rules = readOrEmpty(windsurfRulesPath(home));
	const from = rules.indexOf(WINDSURF_START);
	const to = rules.indexOf(WINDSURF_END);
	if (from === -1 || to <= from) {
		return false;
	}
	return (
		version === undefined || rules.slice(from, to).includes(`> v${version}`)
	);
};

export type SkillTargetName =
	| "Amp Code"
	| "Antigravity"
	| "Claude Code"
	| "Codex"
	| "Cursor"
	| "Gemini CLI"
	| "OpenCode"
	| "Windsurf";

export interface SkillTarget {
	/** Whether the agent's config directory or binary is present. */
	detect: (home: string) => boolean;
	/** Whether the main skill is in place, carrying `version`'s stamp when one is given. */
	installed: (home: string, version?: string) => boolean;
	name: SkillTargetName;
}

// Directories are checked before binaries, so a `which` runs only for an
// agent that keeps no config directory.
export const SKILL_TARGETS: readonly SkillTarget[] = [
	{
		name: "Claude Code",
		detect: (home) => existsSync(join(home, ".claude")),
		installed: (home, version) =>
			hasSkill(join(home, ".claude", "skills"), version),
	},
	{
		name: "Amp Code",
		detect: (home) => existsSync(join(home, ".amp")),
		installed: (home, version) =>
			hasSkill(join(home, ".config", "amp", "skills"), version),
	},
	{
		name: "Cursor",
		detect: (home) => existsSync(join(home, ".cursor")),
		installed: (home, version) =>
			hasSkill(join(home, ".cursor", "skills"), version),
	},
	{
		name: "OpenCode",
		detect: (home) =>
			existsSync(join(home, ".config", "opencode")) ||
			isCommandAvailable("opencode"),
		installed: (home, version) =>
			hasSkill(join(home, ".config", "opencode", "skills"), version),
	},
	{
		name: "Windsurf",
		detect: (home) =>
			existsSync(join(home, ".codeium")) ||
			existsSync(join(home, "Library", "Application Support", "Windsurf")),
		installed: hasWindsurfBlock,
	},
	{
		name: "Antigravity",
		detect: (home) =>
			existsSync(join(home, ".gemini", "antigravity")) ||
			isCommandAvailable("agy"),
		installed: (home, version) =>
			hasSkill(join(home, ".gemini", "antigravity", "skills"), version),
	},
	{
		name: "Gemini CLI",
		detect: (home) =>
			existsSync(join(home, ".gemini")) || isCommandAvailable("gemini"),
		installed: (home, version) =>
			hasSkill(join(home, ".gemini", "skills"), version),
	},
	{
		name: "Codex",
		detect: (home) =>
			existsSync(join(home, ".codex")) || isCommandAvailable("codex"),
		installed: (home, version) =>
			hasSkill(join(home, ".codex", "skills"), version),
	},
];

/** True when some detected agent has the skill, at any version. */
export const anyAgentHasSkill = (home: string): boolean =>
	SKILL_TARGETS.some((target) => target.installed(home) && target.detect(home));

/** True when at least one agent is detected and every detected one carries this version's skill. */
export const skillInstalledForDetectedAgent = (
	version: string,
	home: string = homedir()
): boolean => {
	const detected = SKILL_TARGETS.filter((target) => target.detect(home));
	return (
		detected.length > 0 &&
		detected.every((target) => target.installed(home, version))
	);
};
