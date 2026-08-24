import { render } from "ink";
import { logger } from "../../ui/logger.js";
import { type LaunchableAgent, launchAgent } from "../agents.js";
import { App } from "./app.js";
import type { InteractiveContext } from "./types.js";

const ENTER_ALT_SCREEN = "\x1b[?1049h";
const EXIT_ALT_SCREEN = "\x1b[?1049l";

/** Runs the post-scan TUI in the alternate screen until Quit or Ctrl+C. */
export const runInteractiveApp = async (
	context: InteractiveContext
): Promise<void> => {
	const deferred: string[] = [];

	for (;;) {
		process.stdout.write(ENTER_ALT_SCREEN);
		let request: { agent: LaunchableAgent; prompt: string } | null = null;
		let failure: { error: unknown } | null = null;
		try {
			request = await new Promise<{
				agent: LaunchableAgent;
				prompt: string;
			} | null>((resolvePromise) => {
				const instance = render(
					<App
						context={context}
						deferPrint={(text) => {
							deferred.push(text);
						}}
						onRequestAgent={(agent, prompt) => {
							resolvePromise({ agent, prompt });
							instance.unmount();
						}}
					/>
				);
				instance.waitUntilExit().then(
					() => {
						resolvePromise(null);
					},
					(error) => {
						failure = { error };
						resolvePromise(null);
					}
				);
			});
		} finally {
			process.stdout.write(EXIT_ALT_SCREEN);
		}

		for (const text of deferred.splice(0)) {
			process.stderr.write(`\n${text}\n\n`);
		}

		if (failure) {
			throw (failure as { error: unknown }).error;
		}
		if (!request) {
			break;
		}
		logger.info(
			`Starting ${request.agent.name}. Quit it to come back to the menu.`
		);
		await launchAgent(request.agent, request.prompt, context.targetPath);
	}
};
