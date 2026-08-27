import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		include: [
			"tests/**/*.test.{ts,tsx}",
			"src/**/__tests__/**/*.test.{ts,tsx}",
		],
	},
});
