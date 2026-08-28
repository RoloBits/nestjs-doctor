import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		css: true,
		globals: true,
		include: ["tests/**/*.test.{ts,tsx}"],
		testTimeout: 30_000,
	},
});
