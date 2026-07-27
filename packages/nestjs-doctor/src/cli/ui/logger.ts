import { highlighter } from "./highlighter.js";

const writeLogLine = (text: string): void => {
	console.log(text);
};

// Diagnostics about the run go to stderr, keeping stdout machine-readable.
const writeErrorLine = (text: string): void => {
	console.error(text);
};

export const logger = {
	error(...args: unknown[]) {
		writeErrorLine(highlighter.error(args.join(" ")));
	},
	warn(...args: unknown[]) {
		writeErrorLine(highlighter.warn(args.join(" ")));
	},
	info(...args: unknown[]) {
		writeLogLine(highlighter.info(args.join(" ")));
	},
	success(...args: unknown[]) {
		writeLogLine(highlighter.success(args.join(" ")));
	},
	dim(...args: unknown[]) {
		writeLogLine(highlighter.dim(args.join(" ")));
	},
	log(...args: unknown[]) {
		writeLogLine(args.join(" "));
	},
	break() {
		writeLogLine("");
	},
};
