export const noConsoleLog = {
	meta: {
		id: "no-console-log",
		category: "correctness",
		severity: "warning",
		description: "Console methods should not be used",
		help: "Use the NestJS Logger service instead.",
	},
	check(context) {
		// Simple stub rule for testing
	},
};
