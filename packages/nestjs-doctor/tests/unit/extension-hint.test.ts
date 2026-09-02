import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { extensionHintSite } from "../../src/cli/extension-hint.js";
import { AGENT_ENV_VARS } from "../../src/telemetry/environment.js";
import { markHint, readHints } from "../../src/telemetry/install-id.js";

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

const homes: string[] = [];

/** A throwaway config home, set through the override honoured on every platform. */
const isolated = (): NodeJS.ProcessEnv => {
	const home = mkdtempSync(join(tmpdir(), "nd-hints-"));
	homes.push(home);
	return { NESTJS_DOCTOR_CONFIG_DIR: home };
};

/** A plain interactive console run with nothing recorded yet. */
const site = (
	overrides: Partial<Parameters<typeof extensionHintSite>[0]> = {}
): "menu" | "none" | "run" =>
	extensionHintSite({
		env: {},
		hints: {},
		interactive: false,
		isMachineReadable: false,
		tty: true,
		...overrides,
	});

afterAll(() => {
	for (const home of homes) {
		rmSync(home, { force: true, recursive: true });
	}
});

describe("where the extension hint prints", () => {
	it("prints at the end of a run with no menu", () => {
		expect(site()).toBe("run");
	});

	it("waits for the menu to close on an interactive run", () => {
		// A line printed before the TUI is lost with the alternate screen.
		expect(site({ interactive: true })).toBe("menu");
	});

	it("prints nowhere for a machine-readable run", () => {
		expect(site({ isMachineReadable: true })).toBe("none");
	});

	it("prints nowhere in the scan worker", () => {
		// The worker is constructed machine-readable even for an interactive scan.
		expect(site({ interactive: true, isMachineReadable: true })).toBe("none");
	});

	it("prints nowhere when stderr is not a TTY", () => {
		expect(site({ tty: false })).toBe("none");
	});

	it("prints nowhere in CI", () => {
		expect(site({ env: { CI: "1" } })).toBe("none");
	});

	it("prints nowhere inside a coding agent", () => {
		for (const name of AGENT_ENV_VARS) {
			expect(site({ env: { [name]: "1" } })).toBe("none");
		}
	});

	it("prints nowhere once it has printed", () => {
		expect(site({ hints: { extension: "2026-09-02" } })).toBe("none");
	});

	it("prints nowhere when the extension has already run", () => {
		expect(site({ hints: { lsp: "2026-09-02" } })).toBe("none");
	});

	it("prints on the first qualifying run", () => {
		const env = isolated();

		expect(readHints(env)).toEqual({});
		expect(site({ hints: readHints(env) })).toBe("run");
	});

	it("prints on run 1 and nowhere on run 2", () => {
		const env = isolated();

		expect(site({ hints: readHints(env) })).toBe("run");
		markHint("extension", env);

		expect(site({ hints: readHints(env) })).toBe("none");
	});
});

describe("the hints store", () => {
	it("records the day the notice printed", () => {
		const env = isolated();

		markHint("extension", env);

		expect(readHints(env).extension).toMatch(ISO_DAY);
	});

	it("keeps the other hints and leaves telemetry.json alone", () => {
		const env = isolated();
		const home = env.NESTJS_DOCTOR_CONFIG_DIR as string;
		const identity = `${JSON.stringify({ anonymousId: "a", salt: "s" })}\n`;
		writeFileSync(join(home, "telemetry.json"), identity, "utf-8");

		markHint("lsp", env);
		markHint("extension", env);

		expect(Object.keys(readHints(env)).sort()).toEqual(["extension", "lsp"]);
		expect(readFileSync(join(home, "telemetry.json"), "utf-8")).toBe(identity);
	});

	it("returns false, so the hint stays quiet, when the config directory can't be written", () => {
		const home = mkdtempSync(join(tmpdir(), "nd-hints-blocked-"));
		homes.push(home);
		const blocker = join(home, "file");
		writeFileSync(blocker, "", "utf-8");
		const env = { NESTJS_DOCTOR_CONFIG_DIR: join(blocker, "nope") };

		expect(() => markHint("extension", env)).not.toThrow();
		expect(markHint("extension", env)).toBe(false);
	});
});
