import { highlighter } from "./highlighter.js";

const writeLogLine = (text: string): void => {
	console.log(text);
};

export const logger = {
	error(...args: unknown[]) {
		writeLogLine(highlighter.error(args.join(" ")));
	},
	warn(...args: unknown[]) {
		writeLogLine(highlighter.warn(args.join(" ")));
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
