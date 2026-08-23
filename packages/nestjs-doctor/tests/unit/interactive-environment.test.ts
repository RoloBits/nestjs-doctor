import { describe, expect, it } from "vitest";
import {
	canPrompt,
	isNonInteractiveEnvironment,
} from "../../src/cli/ui/environment.js";

const CONSOLE = { format: "console", score: false };

const tty = {
	stdin: { isTTY: true, setRawMode: () => undefined },
	stdout: { isTTY: true },
};

describe("isNonInteractiveEnvironment", () => {
	it("is false for an empty environment", () => {
		expect(isNonInteractiveEnvironment({})).toBe(false);
	});

	it.each([
		"CI",
		"GITHUB_ACTIONS",
		"GITLAB_CI",
		"JENKINS_URL",
		"BUILDKITE",
	])("detects the %s CI marker", (name) => {
		expect(isNonInteractiveEnvironment({ [name]: "1" })).toBe(true);
	});

	it.each([
		"CLAUDECODE",
		"CURSOR_AGENT",
		"CODEX_SANDBOX",
		"AMP_THREAD_ID",
	])("detects the %s coding-agent marker", (name) => {
		expect(isNonInteractiveEnvironment({ [name]: "1" })).toBe(true);
	});
});

describe("canPrompt", () => {
	it("refuses every non-console format", () => {
		for (const format of ["json", "sarif", "gitlab", "markdown", "github"]) {
			expect(canPrompt({ format, score: false }, {}, tty)).toBe(false);
		}
	});

	it("refuses score-only output", () => {
		expect(canPrompt({ format: "console", score: true }, {}, tty)).toBe(false);
	});

	it("refuses without a TTY on both ends", () => {
		expect(canPrompt(CONSOLE, {}, { ...tty, stdout: { isTTY: false } })).toBe(
			false
		);
	});

	it("refuses when raw mode is unavailable", () => {
		expect(canPrompt(CONSOLE, {}, { ...tty, stdin: { isTTY: true } })).toBe(
			false
		);
	});

	it("refuses a dumb terminal", () => {
		expect(canPrompt(CONSOLE, { TERM: "dumb" }, tty)).toBe(false);
	});

	it("refuses inside CI and coding agents", () => {
		expect(canPrompt(CONSOLE, { CI: "true" }, tty)).toBe(false);
		expect(canPrompt(CONSOLE, { CLAUDECODE: "1" }, tty)).toBe(false);
	});

	it("allows an interactive console run", () => {
		expect(canPrompt(CONSOLE, { TERM: "xterm-256color" }, tty)).toBe(true);
	});
});
