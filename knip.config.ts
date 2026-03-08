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
			ignore: ["packages/website/**"],
		},
		"packages/nestjs-doctor": {
			project: ["src/**/*.ts"],
		},
	},
};

export default config;
