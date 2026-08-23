import type { Category, DiagnosticSurface, Severity } from "./diagnostic.js";

export interface RuleOverride {
	enabled?: boolean;
	excludeClasses?: string[];
	options?: Record<string, unknown>;
	severity?: Severity;
	/** Replaces the rule's own `meta.surfaces`. */
	surfaces?: DiagnosticSurface[];
}

export interface NestjsDoctorIgnoreConfig {
	files?: string[];
	rules?: string[];
}

export interface NestjsDoctorReportConfig {
	telemetry?: boolean;
}

export interface NestjsDoctorConfig {
	categories?: Partial<Record<Category, boolean>>;
	customRulesDir?: string;
	exclude?: string[];
	ignore?: NestjsDoctorIgnoreConfig;
	include?: string[];
	minScore?: number;
	report?: NestjsDoctorReportConfig;
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
