import { spawn } from "node:child_process";
import type { NestjsDoctorConfig } from "../common/config.js";
import { isSet } from "./environment.js";
import type { ScanPayload } from "./scan-telemetry.js";

// Empty disables scan telemetry: no key, no request.
const POSTHOG_KEY = "phc_BGjn97jvL862fdhHAKzJ7mhuXBZm8CEe83ENuMvpCgdD";
const POSTHOG_HOST = "https://us.i.posthog.com";
const TIMEOUT_MS = 3000;

/** Whether a scan may report. The flag, the config key and DO_NOT_TRACK each stop it. */
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
	if (isSet(env.VITEST) || env.NODE_ENV === "test") {
		return false;
	}
	return config?.telemetry !== false;
}

/** Whether a generated report may embed its beacon: the scan gate plus `report.telemetry`. */
export function reportTelemetryEnabled(
	flag: boolean,
	config: NestjsDoctorConfig | undefined,
	env: NodeJS.ProcessEnv = process.env
): boolean {
	return (
		scanTelemetryEnabled(flag, config, env, "always") &&
		config?.report?.telemetry !== false
	);
}

export const TELEMETRY_NOTICE =
	'nestjs-doctor reported this scan anonymously: which built-in rules fired, the score, well-known dependencies, and the shape of your config — never your code, paths, or project name. Turn it off with --no-telemetry, "telemetry": false in your config, or DO_NOT_TRACK=1. https://nestjs.doctor/docs/telemetry';

/** Where the one-per-install notice prints: after the menu closes on an
 * interactive run, after the run otherwise. */
export const telemetryNoticeSite = (input: {
	firstSend: boolean;
	interactive: boolean;
	isMachineReadable: boolean;
}): "menu" | "none" | "run" => {
	if (!input.firstSend || input.isMachineReadable) {
		return "none";
	}
	return input.interactive ? "menu" : "run";
};

/** Runs in a detached child, so a stalled network cannot hold the scan open. */
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

/** Hands the payload to a detached child and returns whether one was started. */
export function sendScanTelemetry(
	payload: ScanPayload,
	distinctId: string,
	env: NodeJS.ProcessEnv = process.env
): boolean {
	if (!POSTHOG_KEY) {
		return false;
	}

	const body = {
		event: "scan_completed",
		distinct_id: distinctId,
		properties: payload,
	};
	if (isSet(env.NESTJS_DOCTOR_TELEMETRY_DEBUG)) {
		process.stderr.write(`${JSON.stringify(body, null, 2)}\n`);
		return false;
	}

	try {
		const child = spawn(
			process.execPath,
			["-e", CHILD_SCRIPT, JSON.stringify({ api_key: POSTHOG_KEY, ...body })],
			{ detached: true, stdio: "ignore", windowsHide: true }
		);
		child.on("error", () => {
			// Best-effort; a scan never fails because of it.
		});
		child.unref();
		return true;
	} catch {
		// Same for an environment that cannot spawn.
		return false;
	}
}
