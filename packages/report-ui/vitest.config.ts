import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		environment: "jsdom",
		include: [
			"tests/**/*.test.{ts,tsx}",
			"src/**/__tests__/**/*.test.{ts,tsx}",
		],
	},
});
