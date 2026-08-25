import type { KnipConfig } from "knip";

const config: KnipConfig = {
	ignoreDependencies: ["@biomejs/biome"],
	ignoreWorkspaces: [
		"packages/nestjs-doctor-lsp",
		"packages/nestjs-doctor-vscode",
		"packages/website",
	],
	workspaces: {
		".": {
			// GitHub Action entry points: invoked by action.yml, not imported.
			ignore: ["packages/website/**", "scripts/action/**"],
		},
		"packages/nestjs-doctor": {
			project: ["src/**/*.ts", "src/**/*.tsx"],
		},
		"packages/report-ui": {
			entry: ["demo/main.tsx"],
			project: ["src/**/*.ts", "src/**/*.tsx"],
		},
	},
};

export default config;
