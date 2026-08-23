import { spawn } from "node:child_process";

const resolveClipboardCommands = (): [string, string[]][] => {
	if (process.platform === "darwin") {
		return [["pbcopy", []]];
	}
	if (process.platform === "win32") {
		return [["clip", []]];
	}
	return [
		["wl-copy", []],
		["xclip", ["-selection", "clipboard"]],
		["xsel", ["--clipboard", "--input"]],
	];
};

const CLIPBOARD_COMMANDS = resolveClipboardCommands();

const tryCommand = (
	command: string,
	commandArgs: string[],
	text: string
): Promise<boolean> => {
	return new Promise((resolvePromise) => {
		const child = spawn(command, commandArgs, {
			stdio: ["pipe", "ignore", "ignore"],
		});
		child.on("error", () => resolvePromise(false));
		child.on("close", (code) => resolvePromise(code === 0));
		child.stdin.on("error", () => {
			// A missing binary also surfaces here; the close handler answers.
		});
		child.stdin.end(text);
	});
};

/** Copies text to the system clipboard; false when no clipboard tool works. */
export const copyToClipboard = async (text: string): Promise<boolean> => {
	for (const [command, commandArgs] of CLIPBOARD_COMMANDS) {
		if (await tryCommand(command, commandArgs, text)) {
			return true;
		}
	}
	return false;
};
