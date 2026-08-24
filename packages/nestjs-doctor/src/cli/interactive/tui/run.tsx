import { render } from "ink";
import { logger } from "../../ui/logger.js";
import { type LaunchableAgent, launchAgent } from "../agents.js";
import { App } from "./app.js";
import type { InteractiveContext } from "./types.js";

/**
 * The post-scan TUI. Re-renders after an agent handoff so the spawned CLI can
 * own the terminal, then quits when the user picks Quit or presses Ctrl+C.
 */
const ENTER_ALT_SCREEN = "\x1b[?1049h";
const EXIT_ALT_SCREEN = "\x1b[?1049l";

/**
 * The post-scan TUI. Runs in the alternate screen buffer, so nothing it draws
 * piles into the terminal's scrollback — on quit the user's own output is
 * exactly where they left it. An agent handoff leaves the buffer first so the
 * spawned CLI owns the normal screen, then the panel comes back after it.
 */
export const runInteractiveApp = async (
	context: InteractiveContext
): Promise<void> => {
	for (;;) {
		process.stdout.write(ENTER_ALT_SCREEN);
		const request = await new Promise<{
			agent: LaunchableAgent;
			prompt: string;
		} | null>((resolvePromise) => {
			try {
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
			} catch (error) {
				resolvePromise(null);
				throw error;
			}
		});
		process.stdout.write(EXIT_ALT_SCREEN);

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
