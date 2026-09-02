import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		css: true,
		globals: true,
		maxWorkers: process.env.CI ? undefined : 4,
		include: ["tests/**/*.test.{ts,tsx}"],
		testTimeout: 30_000,
	},
});
