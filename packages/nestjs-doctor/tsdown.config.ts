import { defineConfig } from "tsdown";

export default defineConfig([
	{
		entry: { "api/index": "src/api/index.ts" },
		format: ["esm"],
		dts: true,
		clean: true,
		sourcemap: false,
		minify: true,
	},
	{
		entry: { "cli/index": "src/cli/index.ts" },
		format: ["esm"],
		banner: { js: "#!/usr/bin/env node" },
		clean: false,
		minify: true,
	},
]);
