import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { homedir, platform } from "node:os";
import { dirname, join } from "node:path";
import { detectKnownCiProvider } from "./environment.js";

interface TelemetryIdentity {
	/** Stable per-install id, or a shared one per provider in CI. */
	anonymousId: string;
	/** Per-project, salted with a value that never leaves the machine. Absent under a known CI provider. */
	projectId?: string;
	/** Whether the id is the one on disk. False in CI and when the home is unwritable. */
	stored: boolean;
}

interface StoredConfig {
	anonymousId: string;
	salt: string;
}

const BACKSLASH = /\\/g;

/** Where the platform expects a CLI to keep its own config. */
export function configDir(env: NodeJS.ProcessEnv = process.env): string {
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

const CI_REPO_SALT = "nestjs-doctor.ci.v1";

/** The variables each provider uses for its numeric repository id. */
const CI_REPO_VARS: Record<string, readonly string[]> = {
	github: ["GITHUB_REPOSITORY_ID"],
	gitlab: ["CI_PROJECT_ID"],
};

function repoKey(provider: string, env: NodeJS.ProcessEnv): string | undefined {
	for (const name of CI_REPO_VARS[provider] ?? []) {
		const raw = env[name]?.trim().toLowerCase();
		if (raw) {
			return raw;
		}
	}
	return undefined;
}

/** One id per repository, or one per provider that names none. */
function ciIdentity(env: NodeJS.ProcessEnv): string | undefined {
	const provider = detectKnownCiProvider(env);
	if (!provider) {
		return undefined;
	}
	const repo = repoKey(provider, env);
	if (!repo) {
		return `ci.${provider}`;
	}
	const hash = createHash("sha256")
		.update(`${CI_REPO_SALT}:${repo}`)
		.digest("hex")
		.slice(0, 16);
	return `ci.${provider}.${hash}`;
}

const readConfig = (file: string): StoredConfig | undefined => {
	try {
		const parsed = JSON.parse(readFileSync(file, "utf-8")) as StoredConfig;
		return parsed.anonymousId && parsed.salt ? parsed : undefined;
	} catch {
		// A missing or corrupt store means no stored id.
	}
};

/** Whether this install has stored an id, without creating one. */
export function hasStoredIdentity(
	env: NodeJS.ProcessEnv = process.env
): boolean {
	return readConfig(join(configDir(env), "telemetry.json")) !== undefined;
}

/** Reads the install id and salt, creating them on first run. */
export function resolveIdentity(
	projectRoot: string,
	env: NodeJS.ProcessEnv = process.env
): TelemetryIdentity {
	// One id per project, whatever spelling of the path arrived.
	let root = projectRoot;
	try {
		root = realpathSync(projectRoot);
	} catch {
		// Hash the path as given.
	}
	root = root.replace(BACKSLASH, "/").toLowerCase();

	const salted = (salt: string) =>
		createHash("sha256").update(`${salt}:${root}`).digest("hex");

	const ci = ciIdentity(env);
	if (ci) {
		// No project id in CI: any salt shipped in the package makes a
		// runner's checkout path guessable.
		return { anonymousId: ci, stored: false };
	}

	const file = join(configDir(env), "telemetry.json");
	const existing = readConfig(file);

	if (existing) {
		return {
			anonymousId: existing.anonymousId,
			projectId: salted(existing.salt),
			stored: true,
		};
	}

	const created: StoredConfig = {
		anonymousId: randomUUID(),
		salt: randomUUID(),
	};

	let stored = false;
	try {
		mkdirSync(dirname(file), { recursive: true });
		writeFileSync(file, `${JSON.stringify(created, null, 2)}\n`, "utf-8");
		stored = true;
	} catch {
		// A read-only home reports a per-run id.
	}

	return {
		anonymousId: created.anonymousId,
		projectId: salted(created.salt),
		stored,
	};
}
