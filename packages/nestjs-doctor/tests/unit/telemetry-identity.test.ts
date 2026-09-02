import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import {
	configDir,
	hasStoredIdentity,
	resolveIdentity,
} from "../../src/telemetry/install-id.js";
import { scanTelemetryEnabled } from "../../src/telemetry/send.js";

const SHA256_HEX = /^[a-f0-9]{64}$/;
const CI_PREFIX = /^ci\./;
const CI_GITHUB_REPO = /^ci\.github\.[a-f0-9]{16}$/;
const CI_GITLAB_REPO = /^ci\.gitlab\.[a-f0-9]{16}$/;

const homes: string[] = [];

/** A throwaway config home, set through the override honoured on every platform. */
const isolated = (extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv => {
	const home = mkdtempSync(join(tmpdir(), "nd-telemetry-"));
	homes.push(home);
	return { NESTJS_DOCTOR_CONFIG_DIR: home, ...extra };
};

/** A GitHub runner's env, with whatever repository variables the case needs. */
const runnerEnv = (extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv =>
	isolated({ CI: "true", GITHUB_ACTIONS: "true", ...extra });

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

	it("gives one id per repository in CI, stable across runs", () => {
		const acme = () =>
			resolveIdentity(
				"/repo/a",
				runnerEnv({ GITHUB_REPOSITORY_ID: "918273645" })
			).anonymousId;

		expect(acme()).toMatch(CI_GITHUB_REPO);
		expect(acme()).toBe(acme());
		expect(
			resolveIdentity(
				"/repo/a",
				runnerEnv({ GITHUB_REPOSITORY_ID: "555000111" })
			).anonymousId
		).not.toBe(acme());
	});

	it("hashes one repository the same from a push and a pull request", () => {
		const repo = {
			GITHUB_REPOSITORY_ID: "918273645",
			GITHUB_REPOSITORY: "acme/api",
		};
		const push = resolveIdentity(
			"/home/runner/work/api/api",
			runnerEnv({
				...repo,
				GITHUB_EVENT_NAME: "push",
				GITHUB_REF: "refs/heads/main",
			})
		);
		const pull = resolveIdentity(
			"/home/runner/work/api/api",
			runnerEnv({
				...repo,
				GITHUB_EVENT_NAME: "pull_request",
				GITHUB_REF: "refs/pull/7/merge",
			})
		);

		expect(pull.anonymousId).toBe(push.anonymousId);
	});

	it("falls back to the repository name, spelled either way", () => {
		const upper = resolveIdentity(
			"/repo/a",
			runnerEnv({ GITHUB_REPOSITORY: "Acme/API" })
		).anonymousId;
		const lower = resolveIdentity(
			"/repo/a",
			runnerEnv({ GITHUB_REPOSITORY: " acme/api " })
		).anonymousId;

		expect(upper).toMatch(CI_GITHUB_REPO);
		expect(lower).toBe(upper);
	});

	it("keeps the repository, the id and the checkout path out of the CI id", () => {
		const id = resolveIdentity(
			"/home/runner/work/acme-api/acme-api",
			runnerEnv({
				GITHUB_REPOSITORY_ID: "918273645",
				GITHUB_REPOSITORY: "acme/acme-api",
			})
		).anonymousId;

		expect(id).not.toContain("acme");
		expect(id).not.toContain("runner");
		expect(id).not.toContain("918273645");
	});

	it("gives one CI id whatever spelling the runner uses for its checkout", () => {
		const repo = { GITHUB_REPOSITORY_ID: "918273645" };
		const linux = resolveIdentity(
			"/home/runner/work/api/api",
			runnerEnv(repo)
		).anonymousId;
		const windows = resolveIdentity(
			"D:/a/api/api",
			runnerEnv(repo)
		).anonymousId;

		expect(windows).toBe(linux);
	});

	it("hashes the GitLab project id too", () => {
		expect(
			resolveIdentity(
				"/repo/a",
				isolated({ GITLAB_CI: "true", CI_PROJECT_ID: "918273645" })
			).anonymousId
		).toMatch(CI_GITLAB_REPO);
	});

	it("keeps a shared id for a provider that names no repository", () => {
		expect(
			resolveIdentity(
				"/repo/a",
				isolated({ JENKINS_URL: "https://ci.example.com" })
			).anonymousId
		).toBe("ci.jenkins");
		expect(resolveIdentity("/repo/a", runnerEnv({})).anonymousId).toBe(
			"ci.github"
		);
	});

	it("treats a bare CI variable as a machine, not a named provider", () => {
		const env = isolated({ CI: "1" });

		const identity = resolveIdentity("/repo/a", env);
		const again = resolveIdentity("/repo/a", env);

		expect(identity.anonymousId).not.toMatch(CI_PREFIX);
		expect(again.anonymousId).toBe(identity.anonymousId);
		expect(again.projectId).toBe(identity.projectId);
	});

	it("sends no project id from CI", () => {
		// A runner's checkout path is a fixed template, so any salt shipped in
		// the package would make the hash reversible to the repository name.
		const runner = resolveIdentity(
			"/home/runner/work/acme-api/acme-api",
			runnerEnv({ GITHUB_REPOSITORY_ID: "918273645" })
		);

		expect(runner.anonymousId).toMatch(CI_GITHUB_REPO);
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

	it("says whether the id it returned was persisted", () => {
		const env = isolated();

		expect(resolveIdentity("/repo/a", env).stored).toBe(true);
		expect(resolveIdentity("/repo/a", env).stored).toBe(true);
	});

	it("says a per-run id was never stored", () => {
		const blocker = join(mkdtempSync(join(tmpdir(), "nd-blocked-")), "file");
		homes.push(dirname(blocker));
		writeFileSync(blocker, "", "utf-8");
		const env = { NESTJS_DOCTOR_CONFIG_DIR: join(blocker, "nope") };

		expect(resolveIdentity("/repo/a", env).stored).toBe(false);
		expect(resolveIdentity("/repo/a", env).stored).toBe(false);
	});

	it("stores nothing in CI", () => {
		expect(
			resolveIdentity(
				"/repo/a",
				runnerEnv({ GITHUB_REPOSITORY_ID: "918273645" })
			).stored
		).toBe(false);
	});

	it("reads each provider only its own repository variables", () => {
		// A GitHub variable left in a GitLab job must not identify the project.
		const gitlab = resolveIdentity(
			"/repo/a",
			isolated({ GITLAB_CI: "true", GITHUB_REPOSITORY: "acme/api" })
		);

		expect(gitlab.anonymousId).toBe("ci.gitlab");
	});

	it("knows whether this install has ever stored an id", () => {
		const env = isolated();

		expect(hasStoredIdentity(env)).toBe(false);
		resolveIdentity("/repo/a", env);
		expect(hasStoredIdentity(env)).toBe(true);
	});

	it("reads the store without creating one", () => {
		const env = isolated();

		hasStoredIdentity(env);

		expect(hasStoredIdentity(env)).toBe(false);
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
