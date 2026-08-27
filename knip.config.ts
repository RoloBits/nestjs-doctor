import type { KnipConfig } from "knip";

const config: KnipConfig = {
	ignoreDependencies: ["@biomejs/biome"],
	ignoreWorkspaces: [
		"packages/nestjs-doctor-lsp",
		"packages/nestjs-doctor-vscode",
		"packages/report-ui",
		"packages/website",
	],
	workspaces: {
		".": {
			// GitHub Action entry points: invoked by action.yml, not imported.
			ignore: [
				"packages/report-ui/**",
				"packages/website/**",
				"scripts/action/**",
			],
		},
		"packages/nestjs-doctor": {
			project: ["src/**/*.ts", "src/**/*.tsx"],
			ignore: ["src/report/ui/generated/**"],
		},
	},
};

export default config;
