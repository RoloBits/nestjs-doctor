import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { configDir, resolveIdentity } from "../../src/telemetry/install-id.js";
import { scanTelemetryEnabled } from "../../src/telemetry/send.js";

const SHA256_HEX = /^[a-f0-9]{64}$/;

const homes: string[] = [];

/** A throwaway config home, set through the override honoured on every platform. */
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
	it("keeps the same id across runs", () => {
		const env = isolated();

		const first = resolveIdentity("/repo/a", env);
		const second = resolveIdentity("/repo/a", env);

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

		expect(runner().anonymousId).toBe("ci.github");
		expect(runner().anonymousId).toBe("ci.github");
		expect(resolveIdentity("/repo/a", isolated({ CI: "1" })).anonymousId).toBe(
			"ci.unknown"
		);
	});

	it("sends no project id from CI", () => {
		// A runner's checkout path is a fixed template, so any salt shipped in
		// the package would make the hash reversible to the repository name.
		const runner = resolveIdentity(
			"/home/runner/work/acme-api/acme-api",
			isolated({ GITHUB_ACTIONS: "1" })
		);

		expect(runner.anonymousId).toBe("ci.github");
		expect(runner.projectId).toBeUndefined();
	});

	it("still sends a project id outside CI", () => {
		const local = resolveIdentity("/repo/a", isolated({}));

		expect(local.projectId).toEqual(expect.any(String));
	});

	it("falls back to a per-run id when the home is unwritable", () => {
		// A directory inside a regular file cannot be created on any platform.
		const blocker = join(mkdtempSync(join(tmpdir(), "nd-blocked-")), "file");
		homes.push(dirname(blocker));
		writeFileSync(blocker, "", "utf-8");
		const env = { NESTJS_DOCTOR_CONFIG_DIR: join(blocker, "nope") };

		const first = resolveIdentity("/repo/a", env);
		const second = resolveIdentity("/repo/a", env);

		expect(first.anonymousId).not.toBe(second.anonymousId);
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
