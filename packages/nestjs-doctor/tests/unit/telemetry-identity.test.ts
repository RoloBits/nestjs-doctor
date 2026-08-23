import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { configDir, resolveIdentity } from "../../src/telemetry/install-id.js";
import { firstRunNotice } from "../../src/telemetry/notice.js";
import { scanTelemetryEnabled } from "../../src/telemetry/send.js";

const SHA256_HEX = /^[a-f0-9]{64}$/;

const homes: string[] = [];

/**
 * An isolated config home, so a test never touches the real one. Uses the
 * explicit override: XDG_CONFIG_HOME alone is ignored on macOS and Windows,
 * which sent an earlier version of this suite into the developer's own home.
 */
const isolated = (extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv => {
	const home = mkdtempSync(join(tmpdir(), "nd-telemetry-"));
	homes.push(home);
	return { NESTJS_DOCTOR_CONFIG_DIR: home, ...extra };
};

afterAll(() => {
	for (const home of homes) {
		rmSync(home, { force: true, recursive: true });
	}
});

describe("install identity", () => {
	it("keeps the same id across runs and flags only the first", () => {
		const env = isolated();

		const first = resolveIdentity("/repo/a", env);
		const second = resolveIdentity("/repo/a", env);

		expect(first.firstRun).toBe(true);
		expect(second.firstRun).toBe(false);
		expect(second.anonymousId).toBe(first.anonymousId);
		expect(second.projectId).toBe(first.projectId);
	});

	it("separates projects on one machine without revealing the path", () => {
		const env = isolated();

		const a = resolveIdentity("/repo/acme-billing", env);
		const b = resolveIdentity("/repo/other", env);

		expect(a.projectId).not.toBe(b.projectId);
		expect(a.projectId).not.toContain("acme-billing");
		expect(a.projectId).toMatch(SHA256_HEX);
	});

	it("gives two machines different ids for the same project", () => {
		// The salt never leaves the machine, so the same path cannot be
		// correlated across installs.
		const one = resolveIdentity("/repo/same", isolated());
		const two = resolveIdentity("/repo/same", isolated());

		expect(one.projectId).not.toBe(two.projectId);
	});

	it("never writes the salt into an id that travels", () => {
		const env = isolated();
		const identity = resolveIdentity("/repo/a", env);
		const stored = JSON.parse(
			readFileSync(join(configDir(env), "telemetry.json"), "utf-8")
		) as { salt: string };

		expect(stored.salt).toBeTruthy();
		expect(identity.projectId).not.toContain(stored.salt);
		expect(identity.anonymousId).not.toContain(stored.salt);
	});

	it("collapses a CI fleet to one id per provider", () => {
		const runner = () =>
			resolveIdentity(
				"/repo/a",
				isolated({ CI: "true", GITHUB_ACTIONS: "true" })
			);

		// Fresh runners every time, so a per-install id would mint a new user
		// on every job.
		expect(runner().anonymousId).toBe("ci.github");
		expect(runner().anonymousId).toBe("ci.github");
		expect(resolveIdentity("/repo/a", isolated({ CI: "1" })).anonymousId).toBe(
			"ci.unknown"
		);
	});

	it("does not announce itself on a disposable CI machine", () => {
		expect(resolveIdentity("/repo/a", isolated({ CI: "true" })).firstRun).toBe(
			false
		);
	});

	it("falls back to a per-run id when the home is unwritable", () => {
		const env = { NESTJS_DOCTOR_CONFIG_DIR: "/dev/null/nope" };

		const first = resolveIdentity("/repo/a", env);
		const second = resolveIdentity("/repo/a", env);

		expect(first.anonymousId).not.toBe(second.anonymousId);
	});
});

describe("first-run notice", () => {
	it("names what is sent and every way to stop it", () => {
		const notice = firstRunNotice();

		expect(notice).toContain("--no-telemetry");
		expect(notice).toContain("DO_NOT_TRACK");
		expect(notice).toContain("never your code");
	});
});

describe("test runs never report", () => {
	it("stays off under vitest and NODE_ENV=test", () => {
		expect(
			scanTelemetryEnabled(true, undefined, { VITEST: "true" }, "phc_key")
		).toBe(false);
		expect(
			scanTelemetryEnabled(true, undefined, { NODE_ENV: "test" }, "phc_key")
		).toBe(false);
	});

	it("is off for this very suite", () => {
		// Reads the real environment: if this ever passes as true, the suite is
		// reporting from whatever machine ran it.
		expect(scanTelemetryEnabled(true, undefined)).toBe(false);
	});
});
