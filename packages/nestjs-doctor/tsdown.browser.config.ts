import { defineConfig } from "tsdown";

// The report's browser-side React app, bundled into the IIFE that
// `getReportScripts` inlines ahead of the remaining script chunks.
export default defineConfig([
	{
		entry: { bundle: "src/report/ui/app/entry.tsx" },
		outDir: "src/report/ui/app",
		format: ["iife"],
		platform: "browser",
		target: "es2020",
		outputOptions: { name: "REPORT_APP" },
		noExternal: [/^react(-dom)?(\/|$)/, "scheduler"],
		inlineOnly: [/^react(-dom)?(\/|$)/, "scheduler"],
		define: { "process.env.NODE_ENV": '"production"' },
		minify: true,
		dts: false,
		clean: false,
		sourcemap: false,
	},
]);
