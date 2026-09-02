import { isNonInteractiveEnvironment } from "./ui/environment.js";

export const EXTENSION_HINT =
	"Get these as you type: VS Code extension rolobits.nestjs-doctor-vscode, or nestjs-doctor-lsp.";

/** Where the one-per-install extension line prints: after the menu closes on an
 * interactive run, after the run otherwise. */
export const extensionHintSite = (input: {
	env?: NodeJS.ProcessEnv;
	hints: Record<string, string>;
	interactive: boolean;
	isMachineReadable: boolean;
	tty: boolean;
}): "menu" | "none" | "run" => {
	if (
		input.isMachineReadable ||
		!input.tty ||
		input.hints.extension ||
		input.hints.lsp ||
		isNonInteractiveEnvironment(input.env)
	) {
		return "none";
	}
	return input.interactive ? "menu" : "run";
};
