import type { Category, Severity } from "./diagnostic.js";

export interface RuleOverride {
	enabled?: boolean;
	severity?: Severity;
}

export interface NestjsDoctorConfig {
	include?: string[];
	exclude?: string[];
	rules?: Record<string, RuleOverride | boolean>;
	categories?: Partial<Record<Category, boolean>>;
	thresholds?: {
		godModuleProviders?: number;
		godModuleImports?: number;
		godServiceMethods?: number;
		godServiceDeps?: number;
	};
}

export const DEFAULT_CONFIG: NestjsDoctorConfig = {
	include: ["**/*.ts"],
	exclude: [
		"node_modules/**",
		"dist/**",
		"build/**",
		"coverage/**",
		"**/*.spec.ts",
		"**/*.test.ts",
		"**/*.e2e-spec.ts",
		"**/*.d.ts",
	],
};
