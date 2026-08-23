import { randomUUID } from "node:crypto";
import type { NestjsDoctorConfig } from "../common/config.js";
import { isSet } from "./environment.js";
import type { ScanPayload } from "./scan-telemetry.js";

// Same project as the report beacon. Empty disables scan telemetry entirely:
// no key, no request.
const POSTHOG_KEY = "";
const POSTHOG_HOST = "https://us.i.posthog.com";
const TIMEOUT_MS = 1500;

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
 * Posts the payload without awaiting it and without holding the process open,
 * so a slow or blocked network cannot delay a scan or a pre-commit hook. A
 * scan that exits first simply loses the event.
 */
export function sendScanTelemetry(payload: ScanPayload): void {
	if (!POSTHOG_KEY) {
		return;
	}

	try {
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
		timer.unref?.();

		fetch(`${POSTHOG_HOST}/e/`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			signal: controller.signal,
			body: JSON.stringify({
				api_key: POSTHOG_KEY,
				event: "scan_completed",
				distinct_id: randomUUID(),
				properties: payload,
			}),
		})
			.catch(() => {
				// Reporting is best-effort; a scan never fails because of it.
			})
			.finally(() => clearTimeout(timer));
	} catch {
		// Same: an environment without fetch reports nothing and scans fine.
	}
}
