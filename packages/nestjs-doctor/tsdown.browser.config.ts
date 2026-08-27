import { defineConfig } from "tsdown";

// The report's browser-side modules, bundled into one IIFE that
// `getReportScripts` inlines ahead of the remaining script chunks.
export default defineConfig({
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
});
