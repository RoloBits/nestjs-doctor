import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { defineConfig } from "tsdown";

const RAW = "?raw";

// Resolves a `./x.css?raw` import to the file's text, matching how Vite
// serves the same specifier under vitest.
const rawText = {
	name: "raw-text",
	resolveId(source: string, importer: string | undefined) {
		if (!(source.endsWith(RAW) && importer)) {
			return null;
		}
		return resolve(dirname(importer), source.slice(0, -RAW.length)) + RAW;
	},
	load(this: { addWatchFile(file: string): void }, id: string) {
		if (!id.endsWith(RAW)) {
			return null;
		}
		const file = id.slice(0, -RAW.length);
		// The `?raw` id is virtual, so the real file needs registering by hand
		// or watch mode never sees it change.
		this.addWatchFile(file);
		return `export default ${JSON.stringify(readFileSync(file, "utf8"))};`;
	},
};

export default defineConfig([
	{
		entry: { "api/index": "src/api/index.ts" },
		format: ["esm"],
		plugins: [rawText],
		dts: true,
		clean: true,
		sourcemap: false,
		minify: true,
	},
	{
		entry: {
			"cli/index": "src/cli/index.ts",
			"cli/scan-worker": "src/cli/scan-worker.ts",
		},
		format: ["esm"],
		plugins: [rawText],
		banner: { js: "#!/usr/bin/env node" },
		clean: false,
		minify: true,
	},
]);
