import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { homedir, platform } from "node:os";
import { dirname, join } from "node:path";

// Empty disables LSP telemetry: no key, no request.
const POSTHOG_KEY = "phc_BGjn97jvL862fdhHAKzJ7mhuXBZm8CEe83ENuMvpCgdD";
const POSTHOG_HOST = "https://us.i.posthog.com";
const TIMEOUT_MS = 3000;
const BACKSLASH = /\\/g;
const CI_SALT = "nestjs-doctor-ci";

/**
 * The file the CLI also reads. Both tools share this format.
 */
interface StoredConfig {
	anonymousId: string;
	salt: string;
}

const isSet = (value: string | undefined): boolean =>
	value !== undefined && value !== "" && value !== "0" && value !== "false";

function configDir(env: NodeJS.ProcessEnv): string {
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

function ciIdentity(env: NodeJS.ProcessEnv): string | undefined {
	const provider = CI_PROVIDERS.find(([name]) => isSet(env[name]));
	if (provider) {
		return `ci.${provider[1]}`;
	}
	return isSet(env.CI) ? "ci.unknown" : undefined;
}

function readStored(file: string): StoredConfig | undefined {
	try {
		const parsed = JSON.parse(readFileSync(file, "utf-8")) as StoredConfig;
		return parsed.anonymousId && parsed.salt ? parsed : undefined;
	} catch {
		return;
	}
}

export interface LspIdentity {
	anonymousId: string;
	projectId: string;
}

/** Reads the id the CLI wrote, creating it when this is the first tool to run. */
export function resolveIdentity(
	projectRoot: string,
	env: NodeJS.ProcessEnv = process.env
): LspIdentity {
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
		return { anonymousId: ci, projectId: salted(CI_SALT) };
	}

	const file = join(configDir(env), "telemetry.json");
	const existing = readStored(file);
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

/** Reads `telemetry` from the three config surfaces, in the CLI's order. */
function configAllows(workspaceRoot: string): boolean {
	for (const name of ["nestjs-doctor.config.json", ".nestjs-doctor.json"]) {
		try {
			const raw = JSON.parse(
				readFileSync(join(workspaceRoot, name), "utf-8")
			) as { telemetry?: boolean };
			return raw.telemetry !== false;
		} catch {
			// Try the next name.
		}
	}

	try {
		const pkg = JSON.parse(
			readFileSync(join(workspaceRoot, "package.json"), "utf-8")
		) as { "nestjs-doctor"?: { telemetry?: boolean } };
		return pkg["nestjs-doctor"]?.telemetry !== false;
	} catch {
		return true;
	}
}

/** Whether this session may report. The editor's setting arrives through initializationOptions. */
export function lspTelemetryEnabled(
	editorAllows: boolean | undefined,
	workspaceRoot: string | undefined,
	env: NodeJS.ProcessEnv = process.env,
	key: string = POSTHOG_KEY
): boolean {
	if (!key || editorAllows === false) {
		return false;
	}
	if (isSet(env.DO_NOT_TRACK)) {
		return false;
	}
	if (isSet(env.VITEST) || env.NODE_ENV === "test") {
		return false;
	}
	return workspaceRoot ? configAllows(workspaceRoot) : true;
}

const CHILD_SCRIPT = `
const body = process.argv[1];
const req = require("node:https").request(${JSON.stringify(`${POSTHOG_HOST}/e/`)}, {
  method: "POST",
  headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) },
  timeout: ${TIMEOUT_MS},
}, (res) => res.resume());
req.on("error", () => {});
req.on("timeout", () => req.destroy());
req.end(body);
`;

/** Posts from a detached child, so the editor never waits on the network. */
export function sendLspEvent(
	event: string,
	distinctId: string,
	properties: Record<string, unknown>
): void {
	if (!POSTHOG_KEY) {
		return;
	}
	try {
		const child = spawn(
			process.execPath,
			[
				"-e",
				CHILD_SCRIPT,
				JSON.stringify({
					api_key: POSTHOG_KEY,
					event,
					distinct_id: distinctId,
					properties,
				}),
			],
			{ detached: true, stdio: "ignore", windowsHide: true }
		);
		child.on("error", () => {
			// Best-effort; the server never fails because of it.
		});
		child.unref();
	} catch {
		// Same for an environment that cannot spawn.
	}
}
