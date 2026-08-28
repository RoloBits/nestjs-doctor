import { defineConfig } from "tsdown";

// The report's browser-side code, bundled into two IIFEs that
// `getReportScripts` inlines ahead of the remaining script chunks:
// RPT holds the pure helpers, REPORT_APP the React tab renderers.
export default defineConfig([
	{
		entry: { bundle: "src/report/ui/browser/entry.ts" },
		outDir: "src/report/ui/browser",
		format: ["iife"],
		platform: "browser",
		target: "es2020",
		outputOptions: { name: "RPT" },
		minify: false,
		dts: false,
		clean: false,
		sourcemap: false,
	},
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
