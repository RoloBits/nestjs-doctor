import { isNonInteractiveEnvironment } from "./ui/environment.js";

export const EXTENSION_HINT =
	"These findings can appear as you type: the VS Code extension rolobits.nestjs-doctor-vscode";

/** Where the one-per-install extension line prints, mirroring `telemetryNoticeSite`. */
export const extensionHintSite = (input: {
	env?: NodeJS.ProcessEnv;
	firstSend: boolean;
	hints: Record<string, string>;
	interactive: boolean;
	isMachineReadable: boolean;
	tty: boolean;
}): "menu" | "none" | "run" => {
	if (
		input.firstSend ||
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
