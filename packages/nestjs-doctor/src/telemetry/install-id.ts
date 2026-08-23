import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { homedir, platform } from "node:os";
import { dirname, join } from "node:path";
import { isSet } from "./environment.js";

interface TelemetryIdentity {
	/** Stable per-install id, or a shared one per provider in CI. */
	anonymousId: string;
	/** Per-project, salted with a value that never leaves the machine. */
	projectId: string;
}

interface StoredConfig {
	anonymousId: string;
	salt: string;
}

const BACKSLASH = /\\/g;

/** Shared by every runner, so one project keeps one id across a fleet. */
const CI_SALT = "nestjs-doctor-ci";

/** Where the platform expects a CLI to keep its own config. */
export function configDir(env: NodeJS.ProcessEnv = process.env): string {
	// Overrides the platform location, on every platform.
	if (env.NESTJS_DOCTOR_CONFIG_DIR) {
		return env.NESTJS_DOCTOR_CONFIG_DIR;
	}
	if (platform() === "win32") {
		return join(
			env.APPDATA ?? join(homedir(), "AppData", "Roaming"),
			"nestjs-doctor"
		);
	}
	if (platform() === "darwin") {
		return join(homedir(), "Library", "Preferences", "nestjs-doctor");
	}
	return join(
		env.XDG_CONFIG_HOME ?? join(homedir(), ".config"),
		"nestjs-doctor"
	);
}

const CI_PROVIDERS: [string, string][] = [
	["GITHUB_ACTIONS", "github"],
	["GITLAB_CI", "gitlab"],
	["CIRCLECI", "circle"],
	["TRAVIS", "travis"],
	["BUILDKITE", "buildkite"],
	["JENKINS_URL", "jenkins"],
];

/**
 * One id per CI provider, shared by every runner.
 */
function ciIdentity(env: NodeJS.ProcessEnv): string | undefined {
	const provider = CI_PROVIDERS.find(([name]) => isSet(env[name]));
	if (provider) {
		return `ci.${provider[1]}`;
	}
	return isSet(env.CI) ? "ci.unknown" : undefined;
}

const readConfig = (file: string): StoredConfig | undefined => {
	try {
		const parsed = JSON.parse(readFileSync(file, "utf-8")) as StoredConfig;
		return parsed.anonymousId && parsed.salt ? parsed : undefined;
	} catch {
		return;
	}
};

/**
 * Reads the install id and project salt, creating them on first run. Any
 * filesystem failure falls back to a per-run id rather than stopping a scan.
 */
export function resolveIdentity(
	projectRoot: string,
	env: NodeJS.ProcessEnv = process.env
): TelemetryIdentity {
	// Resolves symlinks and normalises separators and case, so one project
	// hashes to one id.
	let root = projectRoot;
	try {
		root = realpathSync(projectRoot);
	} catch {
		// A path that no longer resolves hashes as given.
	}
	root = root.replace(BACKSLASH, "/").toLowerCase();

	const salted = (salt: string) =>
		createHash("sha256").update(`${salt}:${root}`).digest("hex");

	const ci = ciIdentity(env);
	// CI hashes with the shared salt instead of the per-install one.
	if (ci) {
		return { anonymousId: ci, projectId: salted(CI_SALT) };
	}

	const file = join(configDir(env), "telemetry.json");
	const existing = readConfig(file);

	if (existing) {
		return {
			anonymousId: existing.anonymousId,
			projectId: salted(existing.salt),
		};
	}

	const created: StoredConfig = {
		anonymousId: randomUUID(),
		salt: randomUUID(),
	};

	try {
		mkdirSync(dirname(file), { recursive: true });
		writeFileSync(file, `${JSON.stringify(created, null, 2)}\n`, "utf-8");
	} catch {
		// A read-only home reports a per-run id.
	}

	return {
		anonymousId: created.anonymousId,
		projectId: salted(created.salt),
	};
}
