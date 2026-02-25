import { defineConfig } from "tsdown";

export default defineConfig({
	entry: { extension: "src/extension.ts" },
	format: ["cjs"],
	external: ["vscode"],
	noExternal: [/^vscode-/],
	inlineOnly: false,
	clean: true,
});
