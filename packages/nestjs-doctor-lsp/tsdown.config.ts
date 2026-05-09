import { defineConfig } from "tsdown";

export default defineConfig([
	{
		entry: { server: "src/server.ts" },
		format: ["cjs"],
		banner: { js: "#!/usr/bin/env node" },
		clean: true,
		noExternal: [/^vscode-languageserver/],
		inlineOnly: false,
	},
	{
		entry: { "scan-worker": "src/scan-worker.ts" },
		format: ["cjs"],
		clean: false,
		noExternal: [/^vscode-languageserver/],
		inlineOnly: false,
	},
]);
