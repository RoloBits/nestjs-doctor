import type { Category, Severity } from "./diagnostic.js";

export interface RuleOverride {
	enabled?: boolean;
	excludeClasses?: string[];
	options?: Record<string, unknown>;
	severity?: Severity;
}

export interface NestjsDoctorIgnoreConfig {
	files?: string[];
	rules?: string[];
}

export interface NestjsDoctorConfig {
	categories?: Partial<Record<Category, boolean>>;
	customRulesDir?: string;
	exclude?: string[];
	ignore?: NestjsDoctorIgnoreConfig;
	include?: string[];
	minScore?: number;
	rules?: Record<string, RuleOverride | boolean>;
}

export const DEFAULT_CONFIG: NestjsDoctorConfig = {
	include: ["**/*.ts"],
	exclude: [
		"**/node_modules/**",
		"**/dist/**",
		"**/build/**",
		"**/coverage/**",
		"**/*.spec.ts",
		"**/*.test.ts",
		"**/*.e2e-spec.ts",
		"**/*.e2e-test.ts",
		"**/*.d.ts",
		"**/test/**",
		"**/tests/**",
		"**/__tests__/**",
		"**/__mocks__/**",
		"**/__fixtures__/**",
		"**/mock/**",
		"**/mocks/**",
		"**/*.mock.ts",
		"**/seeder/**",
		"**/seeders/**",
		"**/*.seed.ts",
		"**/*.seeder.ts",
		"*.config.ts",
		"*.config.js",
		"*.config.mjs",
		"*.config.cjs",
		"*.config.mts",
		"*.config.cts",
	],
};
