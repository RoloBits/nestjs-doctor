import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir, platform } from "node:os";
import { dirname, join } from "node:path";
import { isSet } from "./environment.js";

interface TelemetryIdentity {
	/** Stable per-install id, or a shared one per provider in CI. */
	anonymousId: string;
	/** True the first time a machine is seen, so the notice prints once. */
	firstRun: boolean;
	/** Per-project, salted with a value that never leaves the machine. */
	projectId: string;
}

interface StoredConfig {
	anonymousId: string;
	notifiedAt: string;
	salt: string;
}

/** Where the platform expects a CLI to keep its own config. */
export function configDir(env: NodeJS.ProcessEnv = process.env): string {
	// Honoured on every platform, so a sandbox, an image build, or a test can
	// point the store somewhere disposable.
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
 * A CI fleet is not a machine. Runners are ephemeral and often share an image,
 * so a per-install id would either be minted fresh every run or collapse a whole
 * fleet into one. Every run of a provider reports as the same id instead.
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
	const salted = (salt: string) =>
		createHash("sha256").update(`${salt}:${projectRoot}`).digest("hex");

	const ci = ciIdentity(env);
	const file = join(configDir(env), "telemetry.json");
	const existing = readConfig(file);

	if (existing) {
		return {
			anonymousId: ci ?? existing.anonymousId,
			firstRun: false,
			projectId: salted(existing.salt),
		};
	}

	const created: StoredConfig = {
		anonymousId: randomUUID(),
		notifiedAt: new Date().toISOString(),
		salt: randomUUID(),
	};

	try {
		mkdirSync(dirname(file), { recursive: true });
		writeFileSync(file, `${JSON.stringify(created, null, 2)}\n`, "utf-8");
	} catch {
		// A read-only home still scans; it just never becomes a stable install.
	}

	return {
		anonymousId: ci ?? created.anonymousId,
		// CI machines are disposable, so "first run" there is every run.
		firstRun: !ci,
		projectId: salted(created.salt),
	};
}
