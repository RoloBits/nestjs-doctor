import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
	plugins: [react()],
	build: {
		outDir: "dist",
		emptyOutDir: true,
		target: "es2020",
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
