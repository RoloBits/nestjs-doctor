import { render } from "ink";
import { logger } from "../../ui/logger.js";
import { type LaunchableAgent, launchAgent } from "../agents.js";
import { App } from "./app.js";
import type { InteractiveContext } from "./types.js";

/**
 * The post-scan TUI. Re-renders after an agent handoff so the spawned CLI can
 * own the terminal, then quits when the user picks Quit or presses Ctrl+C.
 */
export const runInteractiveApp = async (
	context: InteractiveContext
): Promise<void> => {
	for (;;) {
		const request: { agent: LaunchableAgent; prompt: string } | null =
			await new Promise((resolvePromise) => {
				const instance = render(
					<App
						context={context}
						onRequestAgent={(agent, prompt) => {
							resolvePromise({ agent, prompt });
							instance.unmount();
						}}
					/>
				);
				instance.waitUntilExit().then(() => {
					resolvePromise(null);
				});
			});

		if (!request) {
			break;
		}
		logger.info(
			`Starting ${request.agent.name}. Quit it to come back to the menu.`
		);
		await launchAgent(request.agent, request.prompt, context.targetPath);
	}

	logger.log("Done.");
};
