import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { lspTelemetryEnabled, resolveIdentity } from "../src/telemetry.js";

const dirs: string[] = [];

const workspace = (config?: Record<string, unknown>): string => {
	const dir = mkdtempSync(join(tmpdir(), "nd-lsp-"));
	dirs.push(dir);
	if (config) {
		writeFileSync(
			join(dir, "nestjs-doctor.config.json"),
			JSON.stringify(config),
			"utf-8"
		);
	}
	return dir;
};

const home = (): NodeJS.ProcessEnv => {
	const dir = mkdtempSync(join(tmpdir(), "nd-lsp-home-"));
	dirs.push(dir);
	return { NESTJS_DOCTOR_CONFIG_DIR: dir };
};

afterAll(() => {
	for (const dir of dirs) {
		rmSync(dir, { force: true, recursive: true });
	}
});

describe("lsp telemetry gating", () => {
	it("stops when the editor says telemetry is off", () => {
		expect(lspTelemetryEnabled(false, workspace(), {}, "phc_key")).toBe(false);
	});

	it("runs when the editor allows it, or says nothing", () => {
		expect(lspTelemetryEnabled(true, workspace(), {}, "phc_key")).toBe(true);
		expect(lspTelemetryEnabled(undefined, workspace(), {}, "phc_key")).toBe(
			true
		);
	});

	it("honours the project's config and DO_NOT_TRACK", () => {
		expect(
			lspTelemetryEnabled(true, workspace({ telemetry: false }), {}, "phc_key")
		).toBe(false);
		expect(
			lspTelemetryEnabled(true, workspace(), { DO_NOT_TRACK: "1" }, "phc_key")
		).toBe(false);
	});

	it("never reports from a test run", () => {
		expect(
			lspTelemetryEnabled(true, workspace(), { VITEST: "true" }, "phc_key")
		).toBe(false);
		// Reads the real environment: true here means this suite reports.
		expect(lspTelemetryEnabled(true, workspace())).toBe(false);
	});
});

describe("lsp identity", () => {
	it("shares one id across sessions on a machine", () => {
		const env = home();

		expect(resolveIdentity("/repo/a", env).anonymousId).toBe(
			resolveIdentity("/repo/b", env).anonymousId
		);
	});

	it("separates projects, and reveals no path", () => {
		const env = home();
		const a = resolveIdentity("/repo/acme-billing", env);
		const b = resolveIdentity("/repo/other", env);

		expect(a.projectId).not.toBe(b.projectId);
		expect(a.projectId).not.toContain("acme");
	});

	it("collapses a CI fleet", () => {
		expect(
			resolveIdentity("/repo/a", { ...home(), GITHUB_ACTIONS: "1" }).anonymousId
		).toBe("ci.github");
	});
});
