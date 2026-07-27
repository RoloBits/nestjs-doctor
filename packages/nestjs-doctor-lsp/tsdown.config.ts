import { defineConfig } from "tsdown";

/** CommonJS is deliberate, so tsdown's "prefer ESM" check is switched off. */
const checks = { legacyCjs: false } as const;

export default defineConfig([
	{
		entry: { server: "src/server.ts" },
		format: ["cjs"],
		checks,
		banner: { js: "#!/usr/bin/env node" },
		clean: true,
		noExternal: [/^vscode-languageserver/],
		inlineOnly: false,
	},
	{
		entry: { "scan-worker": "src/scan-worker.ts" },
		format: ["cjs"],
		checks,
		clean: false,
		noExternal: [/^vscode-languageserver/],
		inlineOnly: false,
	},
]);
