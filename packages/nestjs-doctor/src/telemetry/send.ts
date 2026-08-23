import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import type { NestjsDoctorConfig } from "../common/config.js";
import { isSet } from "./environment.js";
import type { ScanPayload } from "./scan-telemetry.js";

// Same project as the report beacon. Empty disables scan telemetry entirely:
// no key, no request.
const POSTHOG_KEY = "phc_BGjn97jvL862fdhHAKzJ7mhuXBZm8CEe83ENuMvpCgdD";
const POSTHOG_HOST = "https://us.i.posthog.com";
const TIMEOUT_MS = 3000;

/**
 * Whether a scan may report. The flag and the config key each disable it on
 * their own, as does the cross-tool DO_NOT_TRACK convention.
 */
export function scanTelemetryEnabled(
	flag: boolean,
	config: NestjsDoctorConfig | undefined,
	env: NodeJS.ProcessEnv = process.env,
	key: string = POSTHOG_KEY
): boolean {
	if (!(flag && key)) {
		return false;
	}
	if (isSet(env.DO_NOT_TRACK)) {
		return false;
	}
	return config?.telemetry !== false;
}

/**
 * Runs in a detached child. An in-process request keeps the event loop alive
 * until it settles, which on a network that drops the connection delayed the
 * scan by ten seconds.
 */
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

/** Hands the payload to a detached child, so the scan never waits on the network. */
export function sendScanTelemetry(payload: ScanPayload): void {
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
					event: "scan_completed",
					distinct_id: randomUUID(),
					properties: payload,
				}),
			],
			{ detached: true, stdio: "ignore", windowsHide: true }
		);
		child.on("error", () => {
			// Reporting is best-effort; a scan never fails because of it.
		});
		child.unref();
	} catch {
		// Same: an environment that cannot spawn reports nothing and scans fine.
	}
}
