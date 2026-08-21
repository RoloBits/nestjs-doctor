import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const FAKE_HOME = "/fake-home";
const SKILL_FIXTURES: Record<string, string> = {
	"nestjs-boot-trace":
		"---\nname: nestjs-boot-trace\n---\n\n# Boot Trace\n\n> v0.0.0\n\nBoot trace content.",
	"nestjs-doctor":
		"---\nname: nestjs-doctor\n---\n\n# Skill\n\n> v0.0.0\n\nSome content.",
	"nestjs-doctor-create-rule":
		"---\nname: nestjs-doctor-create-rule\n---\n\n# Create Rule\n\n> v0.0.0\n\nCreate rule content.",
};
const missingSkills = new Set<string>();
const BACKSLASH_RE = /\\/g;
const SKILL_PATH_RE = /\/skills\/([^/]+)\/SKILL\.md$/;
const CREATE_RULE_REFS_RE = /nestjs-doctor-create-rule\/references$/;
const FAKE_VERSION = "1.2.3";

const mockState = {
	existingPaths: new Set<string>(),
	existingFileContents: new Map<string, string>(),
	failingWritePaths: new Set<string>(),
	availableCommands: new Set<string>(),
	skillsHaveReferences: false,
};

const writes = {
	files: new Map<string, string>(),
	appends: new Map<string, string>(),
	dirs: new Set<string>(),
	copies: new Map<string, string>(),
};

vi.mock("node:os", () => ({
	homedir: () => FAKE_HOME,
}));

vi.mock("node:fs", () => ({
	existsSync: (p: string) =>
		mockState.existingPaths.has(p) ||
		mockState.existingFileContents.has(p) ||
		(mockState.skillsHaveReferences && p.endsWith("references")),
}));

const WHICH_RE = /^(which|where)\s+/;

vi.mock("node:fs/promises", () => ({
	readFile: (p: string) => {
		if (mockState.existingFileContents.has(p)) {
			return Promise.resolve(mockState.existingFileContents.get(p)!);
		}
		const skill = p.replace(BACKSLASH_RE, "/").match(SKILL_PATH_RE)?.[1];
		if (skill && SKILL_FIXTURES[skill] && !missingSkills.has(skill)) {
			return Promise.resolve(SKILL_FIXTURES[skill]);
		}
		return Promise.reject(new Error(`ENOENT: ${p}`));
	},
	writeFile: (p: string, content: string) => {
		if (mockState.failingWritePaths.has(p)) {
			return Promise.reject(new Error(`EACCES: ${p}`));
		}
		writes.files.set(p, content);
		return Promise.resolve();
	},
	appendFile: (p: string, content: string) => {
		writes.appends.set(p, content);
		return Promise.resolve();
	},
	cp: (from: string, to: string) => {
		writes.copies.set(to, from);
		return Promise.resolve();
	},
	mkdir: (p: string) => {
		if (
			mockState.failingWritePaths.has(p) ||
			[...mockState.failingWritePaths].some((fp) => p.startsWith(fp))
		) {
			return Promise.reject(new Error(`EACCES: ${p}`));
		}
		writes.dirs.add(p);
		return Promise.resolve();
	},
}));

vi.mock("node:child_process", () => ({
	execSync: (cmd: string) => {
		const command = cmd.replace(WHICH_RE, "");
		if (mockState.availableCommands.has(command)) {
			return Buffer.from(`/usr/bin/${command}`);
		}
		throw new Error(`not found: ${command}`);
	},
}));

const mockLogger = {
	success: vi.fn(),
	error: vi.fn(),
	warn: vi.fn(),
	dim: vi.fn(),
	break: vi.fn(),
	info: vi.fn(),
	log: vi.fn(),
};

vi.mock("../../src/cli/ui/logger.js", () => ({
	logger: mockLogger,
}));

beforeEach(() => {
	missingSkills.clear();
	mockState.skillsHaveReferences = false;
	mockState.existingPaths.clear();
	mockState.existingFileContents.clear();
	mockState.failingWritePaths.clear();
	mockState.availableCommands.clear();

	writes.files.clear();
	writes.appends.clear();
	writes.dirs.clear();
	writes.copies.clear();

	vi.clearAllMocks();
});

const loadInitSkill = async () => {
	const mod = await import("../../src/cli/init.js");
	return mod.initSkill;
};

describe("initSkill", () => {
	it("always writes project-level fallback", async () => {
		const initSkill = await loadInitSkill();
		await initSkill("/project", FAKE_VERSION);

		const projectDir = join("/project", ".agents", "nestjs-doctor");
		expect(writes.dirs.has(projectDir)).toBe(true);
		expect(writes.files.has(join(projectDir, "SKILL.md"))).toBe(true);
		expect(writes.files.has(join(projectDir, "AGENTS.md"))).toBe(true);

		const createRuleProjectDir = join(
			"/project",
			".agents",
			"nestjs-doctor-create-rule"
		);
		expect(writes.dirs.has(createRuleProjectDir)).toBe(true);
		expect(writes.files.has(join(createRuleProjectDir, "SKILL.md"))).toBe(true);
		expect(writes.files.has(join(createRuleProjectDir, "AGENTS.md"))).toBe(
			true
		);

		const bootTraceProjectDir = join(
			"/project",
			".agents",
			"nestjs-boot-trace"
		);
		expect(writes.dirs.has(bootTraceProjectDir)).toBe(true);
		expect(writes.files.has(join(bootTraceProjectDir, "SKILL.md"))).toBe(true);
		expect(writes.files.has(join(bootTraceProjectDir, "AGENTS.md"))).toBe(true);
	});

	it("detects Claude Code and installs skill files", async () => {
		mockState.existingPaths.add(join(FAKE_HOME, ".claude"));

		const initSkill = await loadInitSkill();
		await initSkill("/project", FAKE_VERSION);

		const dir = join(FAKE_HOME, ".claude", "skills", "nestjs-doctor");
		expect(writes.files.has(join(dir, "SKILL.md"))).toBe(true);
		expect(writes.files.has(join(dir, "AGENTS.md"))).toBe(true);

		const createRuleDir = join(
			FAKE_HOME,
			".claude",
			"skills",
			"nestjs-doctor-create-rule"
		);
		expect(writes.files.has(join(createRuleDir, "SKILL.md"))).toBe(true);
		expect(writes.files.has(join(createRuleDir, "AGENTS.md"))).toBe(true);

		const bootTraceDir = join(
			FAKE_HOME,
			".claude",
			"skills",
			"nestjs-boot-trace"
		);
		expect(writes.files.has(join(bootTraceDir, "SKILL.md"))).toBe(true);
		expect(writes.files.has(join(bootTraceDir, "AGENTS.md"))).toBe(true);
		expect(mockLogger.success).toHaveBeenCalledWith(
			"Installed 3 skills for Claude Code"
		);
	});

	it("replaces version placeholder in SKILL.md", async () => {
		mockState.existingPaths.add(join(FAKE_HOME, ".claude"));

		const initSkill = await loadInitSkill();
		await initSkill("/project", FAKE_VERSION);

		const dir = join(FAKE_HOME, ".claude", "skills", "nestjs-doctor");
		const content = writes.files.get(join(dir, "SKILL.md"))!;
		expect(content).toContain(`> v${FAKE_VERSION}`);
		expect(content).not.toContain("> v0.0.0");

		const bootTraceDir = join(
			FAKE_HOME,
			".claude",
			"skills",
			"nestjs-boot-trace"
		);
		const bootTraceContent = writes.files.get(join(bootTraceDir, "SKILL.md"))!;
		expect(bootTraceContent).toContain(`> v${FAKE_VERSION}`);
		expect(bootTraceContent).not.toContain("> v0.0.0");
	});

	it("installs Codex extra agent config file", async () => {
		mockState.availableCommands.add("codex");

		const initSkill = await loadInitSkill();
		await initSkill("/project", FAKE_VERSION);

		const dir = join(FAKE_HOME, ".codex", "skills", "nestjs-doctor");
		expect(writes.files.has(join(dir, "AGENTS.md"))).toBe(true);

		const agentConfig = writes.files.get(
			join(FAKE_HOME, ".codex", "agents", "openai.yaml")
		)!;
		expect(agentConfig).toContain("display_name");
		expect(agentConfig).toContain("nestjs-doctor");
	});

	it("creates new Windsurf global_rules.md when it does not exist", async () => {
		mockState.existingPaths.add(join(FAKE_HOME, ".codeium"));

		const initSkill = await loadInitSkill();
		await initSkill("/project", FAKE_VERSION);

		const rulesPath = join(
			FAKE_HOME,
			".codeium",
			"windsurf",
			"memories",
			"global_rules.md"
		);
		expect(writes.files.has(rulesPath)).toBe(true);
		expect(writes.files.get(rulesPath)).toContain(
			"<!-- nestjs-doctor:start -->"
		);
		expect(writes.files.get(rulesPath)).toContain("<!-- nestjs-doctor:end -->");
	});

	it("appends to existing Windsurf global_rules.md without the block", async () => {
		mockState.existingPaths.add(join(FAKE_HOME, ".codeium"));
		const rulesPath = join(
			FAKE_HOME,
			".codeium",
			"windsurf",
			"memories",
			"global_rules.md"
		);
		mockState.existingFileContents.set(rulesPath, "# Existing Rules\n");

		const initSkill = await loadInitSkill();
		await initSkill("/project", FAKE_VERSION);

		expect(writes.appends.has(rulesPath)).toBe(true);
		expect(writes.appends.get(rulesPath)).toContain(
			"<!-- nestjs-doctor:start -->"
		);
	});

	it("copies a skill's references directory alongside SKILL.md", async () => {
		mockState.existingPaths.add(join(FAKE_HOME, ".claude"));
		mockState.skillsHaveReferences = true;

		const initSkill = await loadInitSkill();
		await initSkill("/project", FAKE_VERSION);

		const target = join(
			FAKE_HOME,
			".claude",
			"skills",
			"nestjs-doctor-create-rule",
			"references"
		);
		expect(writes.copies.has(target)).toBe(true);
		expect(writes.copies.get(target)).toMatch(CREATE_RULE_REFS_RE);
	});

	it("copies nothing when a skill has no references directory", async () => {
		mockState.existingPaths.add(join(FAKE_HOME, ".claude"));

		const initSkill = await loadInitSkill();
		await initSkill("/project", FAKE_VERSION);

		expect(writes.copies.size).toBe(0);
	});

	it("stops with an actionable error when a skill source is missing", async () => {
		mockState.existingPaths.add(join(FAKE_HOME, ".claude"));
		missingSkills.add("nestjs-boot-trace");

		const initSkill = await loadInitSkill();
		await initSkill("/project", FAKE_VERSION);

		expect(mockLogger.error).toHaveBeenCalledWith(
			expect.stringContaining("Reinstall nestjs-doctor")
		);
		expect(writes.files.size).toBe(0);
	});

	it("writes AGENTS.md as the skill body with the frontmatter stripped", async () => {
		mockState.existingPaths.add(join(FAKE_HOME, ".claude"));

		const initSkill = await loadInitSkill();
		await initSkill("/project", FAKE_VERSION);

		const agents = writes.files.get(
			join(FAKE_HOME, ".claude", "skills", "nestjs-boot-trace", "AGENTS.md")
		);
		expect(agents).toBeDefined();
		expect(agents).toContain("Boot trace content.");
		expect(agents).toContain(`> v${FAKE_VERSION}`);
		expect(agents).not.toContain("name: nestjs-boot-trace");
		expect(agents).not.toContain("---");
	});

	it("replaces the managed block when Windsurf already has one", async () => {
		mockState.existingPaths.add(join(FAKE_HOME, ".codeium"));
		const rulesPath = join(
			FAKE_HOME,
			".codeium",
			"windsurf",
			"memories",
			"global_rules.md"
		);
		mockState.existingFileContents.set(
			rulesPath,
			"# Mine\n<!-- nestjs-doctor:start -->\nstale\n<!-- nestjs-doctor:end -->\n# Also mine\n"
		);

		const initSkill = await loadInitSkill();
		await initSkill("/project", FAKE_VERSION);

		const written = writes.files.get(rulesPath);
		expect(writes.appends.has(rulesPath)).toBe(false);
		expect(written).toBeDefined();
		expect(written).not.toContain("stale");
		expect(written).toContain("# Mine");
		expect(written).toContain("# Also mine");
		expect(written).toContain("Boot trace content.");
	});

	it("skips agents that are not detected", async () => {
		const initSkill = await loadInitSkill();
		await initSkill("/project", FAKE_VERSION);

		// Only project fallback should be installed (1 target)
		expect(mockLogger.success).toHaveBeenCalledTimes(1);
		expect(mockLogger.success).toHaveBeenCalledWith(
			"Installed 3 skills to .agents/"
		);
		expect(mockLogger.dim).toHaveBeenCalledWith(
			expect.stringContaining("1 target")
		);
	});

	it("detects Gemini CLI via command availability", async () => {
		mockState.availableCommands.add("gemini");

		const initSkill = await loadInitSkill();
		await initSkill("/project", FAKE_VERSION);

		const dir = join(FAKE_HOME, ".gemini", "skills", "nestjs-doctor");
		expect(writes.files.has(join(dir, "AGENTS.md"))).toBe(true);

		const createRuleDir = join(
			FAKE_HOME,
			".gemini",
			"skills",
			"nestjs-doctor-create-rule"
		);
		expect(writes.files.has(join(createRuleDir, "AGENTS.md"))).toBe(true);

		const bootTraceDir = join(
			FAKE_HOME,
			".gemini",
			"skills",
			"nestjs-boot-trace"
		);
		expect(writes.files.has(join(bootTraceDir, "AGENTS.md"))).toBe(true);
		expect(mockLogger.success).toHaveBeenCalledWith(
			"Installed 3 skills for Gemini CLI"
		);
	});

	it("logs error and continues when an agent install fails", async () => {
		mockState.existingPaths.add(join(FAKE_HOME, ".claude"));
		mockState.existingPaths.add(join(FAKE_HOME, ".cursor"));

		// Make Claude Code directory fail
		const claudeDir = join(FAKE_HOME, ".claude", "skills", "nestjs-doctor");
		mockState.failingWritePaths.add(claudeDir);

		const initSkill = await loadInitSkill();
		await initSkill("/project", FAKE_VERSION);

		expect(mockLogger.error).toHaveBeenCalledWith(
			"Failed to install skills for Claude Code"
		);
		// Cursor should still succeed
		expect(mockLogger.success).toHaveBeenCalledWith(
			"Installed 3 skills for Cursor"
		);
	});

	it("logs correct target count in summary", async () => {
		mockState.existingPaths.add(join(FAKE_HOME, ".claude"));
		mockState.existingPaths.add(join(FAKE_HOME, ".cursor"));

		const initSkill = await loadInitSkill();
		await initSkill("/project", FAKE_VERSION);

		// 2 agents + 1 project fallback = 3 targets
		expect(mockLogger.dim).toHaveBeenCalledWith(
			expect.stringContaining("3 targets")
		);
	});
});
