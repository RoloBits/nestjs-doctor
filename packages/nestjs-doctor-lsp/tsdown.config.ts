import { defineConfig } from "tsdown";

export default defineConfig({
	entry: {
		server: "src/server.ts",
		"scan-worker": "src/scan-worker.ts",
	},
	format: ["cjs"],
	clean: true,
	noExternal: [/^vscode-languageserver/],
	inlineOnly: false,
});
