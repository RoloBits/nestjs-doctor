import { loadConfig } from "../engine/config/loader.js";
import { resolveIdentity } from "./install-id.js";
import { scanTelemetryEnabled, sendTelemetryEvent } from "./send.js";

export interface CommandTelemetryInput {
	command: "ci_install" | "init";
	/** A `--config` path, when one was passed. */
	configPath?: string;
	/** Injectable for tests; defaults to the real environment. */
	env?: NodeJS.ProcessEnv;
	from: "flag" | "menu";
	/** Injectable for tests; defaults to the compiled-in gating. */
	isEnabled?: typeof scanTelemetryEnabled;
	/** The `--telemetry` flag as parsed. */
	optionsTelemetry: boolean;
	/** Injectable for tests; defaults to the real install-id resolver. */
	resolveIdentityFn?: typeof resolveIdentity;
	/** Injectable for tests; defaults to the detached-child sender. */
	send?: typeof sendTelemetryEvent;
	targetPath: string;
}

/**
 * Reports a finished command under the install id. Reads the project config
 * for its opt-out and sends nothing else about the project.
 */
export const reportCommandTelemetry = async (
	input: CommandTelemetryInput
): Promise<void> => {
	const env = input.env ?? process.env;
	try {
		const config = await loadConfig(input.targetPath, input.configPath).catch(
			() => undefined
		);
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
		// Reporting never breaks a command.
	}
};
