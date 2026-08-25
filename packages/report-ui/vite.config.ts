import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
	plugins: [react()],
	// react-dom's CJS wrapper keeps bare process.env.NODE_ENV through the
	// lib build; without this the IIFE throws on load in browsers.
	define: {
		"process.env.NODE_ENV": JSON.stringify("production"),
	},
	build: {
		outDir: "dist",
		emptyOutDir: true,
		target: "es2022",
		cssCodeSplit: false,
		lib: {
			entry: "src/index.tsx",
			formats: ["iife"],
			name: "NDReport",
			fileName: () => "report-ui.js",
		},
		rollupOptions: {
			output: {
				assetFileNames: "report-ui[extname]",
			},
		},
	},
});
