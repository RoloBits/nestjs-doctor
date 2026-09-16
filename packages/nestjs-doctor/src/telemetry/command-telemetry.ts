import { loadConfig } from "../engine/config/loader.js";
import { resolveIdentity } from "./install-id.js";
import { scanTelemetryEnabled, sendTelemetryEvent } from "./send.js";

export interface CommandTelemetryInput {
	command: "ci_install" | "init";
	/** A `--config` path, when one was passed. */
	configPath?: string;
	/** Defaults to `process.env`. */
	env?: NodeJS.ProcessEnv;
	from: "flag" | "menu";
	/** Defaults to the compiled-in gate. */
	isEnabled?: typeof scanTelemetryEnabled;
	/** The `--telemetry` flag as parsed. */
	optionsTelemetry: boolean;
	/** Defaults to the on-disk install id. */
	resolveIdentityFn?: typeof resolveIdentity;
	/** Defaults to the detached-child sender. */
	send?: typeof sendTelemetryEvent;
	/** Set when a scanned sub-project declared `telemetry: false`. */
	subProjectOptOut?: boolean;
	targetPath: string;
}

/**
 * Reports a finished command under the install id. A config that will not
 * load counts as an opt-out.
 */
export const reportCommandTelemetry = async (
	input: CommandTelemetryInput
): Promise<void> => {
	if (input.subProjectOptOut) {
		return;
	}
	const env = input.env ?? process.env;
	try {
		const config = await loadConfig(input.targetPath, input.configPath);
		if (
			!(input.isEnabled ?? scanTelemetryEnabled)(
				input.optionsTelemetry,
				config,
				env
			)
		) {
			return;
		}
		const identity = (input.resolveIdentityFn ?? resolveIdentity)(
			input.targetPath,
			env
		);
		(input.send ?? sendTelemetryEvent)(
			"command_completed",
			{ command: input.command, from: input.from },
			identity.anonymousId,
			env
		);
	} catch {
		// Nothing is sent.
	}
};
