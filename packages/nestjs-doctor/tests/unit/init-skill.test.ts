import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const FAKE_HOME = "/fake-home";
const FAKE_SKILL_TEMPLATE = "# Skill\n\n> v0.0.0\n\nSome content.";
const FAKE_CREATE_RULE_TEMPLATE =
	"# Create Rule\n\n> v0.0.0\n\nCreate rule content.";
const FAKE_VERSION = "1.2.3";

const mockState = {
	existingPaths: new Set<string>(),
	existingFileContents: new Map<string, string>(),
	failingWritePaths: new Set<string>(),
	availableCommands: new Set<string>(),
};

const writes = {
	files: new Map<string, string>(),
	appends: new Map<string, string>(),
	dirs: new Set<string>(),
};

vi.mock("node:os", () => ({
	homedir: () => FAKE_HOME,
}));

vi.mock("node:fs", () => ({
	existsSync: (p: string) =>
		mockState.existingPaths.has(p) || mockState.existingFileContents.has(p),
}));

const WHICH_RE = /^(which|where)\s+/;

vi.mock("node:fs/promises", () => ({
	readFile: (p: string) => {
		if (mockState.existingFileContents.has(p)) {
			return Promise.resolve(mockState.existingFileContents.get(p)!);
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

vi.mock("node:module", () => ({
	createRequire: () => ({
		resolve: (specifier: string) => {
			if (specifier.includes("CREATE-RULE-SKILL.md")) {
				return "/resolved/CREATE-RULE-SKILL.md";
			}
			if (specifier.includes("SKILL.md")) {
				return "/resolved/SKILL.md";
			}
			if (specifier.includes("package.json")) {
				return "/resolved/package.json";
			}
			return specifier;
		},
	}),
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

vi.mock("../../src/cli/output/logger.js", () => ({
	logger: mockLogger,
}));

beforeEach(() => {
	mockState.existingPaths.clear();
	mockState.existingFileContents.clear();
	mockState.failingWritePaths.clear();
	mockState.availableCommands.clear();

	writes.files.clear();
	writes.appends.clear();
	writes.dirs.clear();

	vi.clearAllMocks();

	mockState.existingFileContents.set("/resolved/SKILL.md", FAKE_SKILL_TEMPLATE);
	mockState.existingFileContents.set(
		"/resolved/CREATE-RULE-SKILL.md",
		FAKE_CREATE_RULE_TEMPLATE
	);
	mockState.existingFileContents.set(
		"/resolved/package.json",
		JSON.stringify({ version: FAKE_VERSION })
	);
});

const loadInitSkill = async () => {
	const mod = await import("../../src/cli/init-skill.js");
	return mod.initSkill;
};

describe("initSkill", () => {
	it("always writes project-level fallback", async () => {
		const initSkill = await loadInitSkill();
		await initSkill("/project");

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
	});

	it("detects Claude Code and installs skill files", async () => {
		mockState.existingPaths.add(join(FAKE_HOME, ".claude"));

		const initSkill = await loadInitSkill();
		await initSkill("/project");

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
		expect(mockLogger.success).toHaveBeenCalledWith(
			"Installed 2 skills for Claude Code"
		);
	});

	it("replaces version placeholder in SKILL.md", async () => {
		mockState.existingPaths.add(join(FAKE_HOME, ".claude"));

		const initSkill = await loadInitSkill();
		await initSkill("/project");

		const dir = join(FAKE_HOME, ".claude", "skills", "nestjs-doctor");
		const content = writes.files.get(join(dir, "SKILL.md"))!;
		expect(content).toContain(`> v${FAKE_VERSION}`);
		expect(content).not.toContain("> v0.0.0");
	});

	it("installs Codex extra agent config file", async () => {
		mockState.availableCommands.add("codex");

		const initSkill = await loadInitSkill();
		await initSkill("/project");

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
		await initSkill("/project");

		const rulesPath = join(
			FAKE_HOME,
			".codeium",
			"windsurf",
			"memories",
			"global_rules.md"
		);
		expect(writes.files.has(rulesPath)).toBe(true);
		expect(writes.files.get(rulesPath)).toContain("# NestJS Doctor");
	});

	it("appends to existing Windsurf global_rules.md without marker", async () => {
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
		await initSkill("/project");

		expect(writes.appends.has(rulesPath)).toBe(true);
		expect(writes.appends.get(rulesPath)).toContain("# NestJS Doctor");
	});

	it("skips Windsurf append when marker already exists", async () => {
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
			"# NestJS Doctor\nAlready installed.\n"
		);

		const initSkill = await loadInitSkill();
		await initSkill("/project");

		expect(writes.appends.has(rulesPath)).toBe(false);
		expect(writes.files.has(rulesPath)).toBe(false);
	});

	it("skips agents that are not detected", async () => {
		const initSkill = await loadInitSkill();
		await initSkill("/project");

		// Only project fallback should be installed (1 target)
		expect(mockLogger.success).toHaveBeenCalledTimes(1);
		expect(mockLogger.success).toHaveBeenCalledWith(
			"Installed 2 skills to .agents/"
		);
		expect(mockLogger.dim).toHaveBeenCalledWith(
			expect.stringContaining("1 target")
		);
	});

	it("detects Gemini CLI via command availability", async () => {
		mockState.availableCommands.add("gemini");

		const initSkill = await loadInitSkill();
		await initSkill("/project");

		const dir = join(FAKE_HOME, ".gemini", "skills", "nestjs-doctor");
		expect(writes.files.has(join(dir, "AGENTS.md"))).toBe(true);

		const createRuleDir = join(
			FAKE_HOME,
			".gemini",
			"skills",
			"nestjs-doctor-create-rule"
		);
		expect(writes.files.has(join(createRuleDir, "AGENTS.md"))).toBe(true);
		expect(mockLogger.success).toHaveBeenCalledWith(
			"Installed 2 skills for Gemini CLI"
		);
	});

	it("logs error and continues when an agent install fails", async () => {
		mockState.existingPaths.add(join(FAKE_HOME, ".claude"));
		mockState.existingPaths.add(join(FAKE_HOME, ".cursor"));

		// Make Claude Code directory fail
		const claudeDir = join(FAKE_HOME, ".claude", "skills", "nestjs-doctor");
		mockState.failingWritePaths.add(claudeDir);

		const initSkill = await loadInitSkill();
		await initSkill("/project");

		expect(mockLogger.error).toHaveBeenCalledWith(
			"Failed to install skills for Claude Code"
		);
		// Cursor should still succeed
		expect(mockLogger.success).toHaveBeenCalledWith(
			"Installed 2 skills for Cursor"
		);
	});

	it("logs correct target count in summary", async () => {
		mockState.existingPaths.add(join(FAKE_HOME, ".claude"));
		mockState.existingPaths.add(join(FAKE_HOME, ".cursor"));

		const initSkill = await loadInitSkill();
		await initSkill("/project");

		// 2 agents + 1 project fallback = 3 targets
		expect(mockLogger.dim).toHaveBeenCalledWith(
			expect.stringContaining("3 targets")
		);
	});
});
