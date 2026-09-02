import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		globals: true,
		maxWorkers: process.env.CI ? undefined : 4,
		include: ["tests/**/*.test.ts"],
	},
});
