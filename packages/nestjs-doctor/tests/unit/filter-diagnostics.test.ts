import { describe, expect, it } from "vitest";
import { filterIgnoredDiagnostics } from "../../src/core/filter-diagnostics.js";
import type { NestjsDoctorConfig } from "../../src/types/config.js";
import type { Diagnostic } from "../../src/types/diagnostic.js";

const createDiagnostic = (overrides: Partial<Diagnostic> = {}): Diagnostic => ({
	filePath: "src/app.service.ts",
	rule: "architecture/no-god-service",
	severity: "warning",
	message: "test message",
	help: "test help",
	line: 1,
	column: 1,
	category: "architecture",
	...overrides,
});

describe("filterIgnoredDiagnostics", () => {
	it("returns all diagnostics when config has no ignore config", () => {
		const diagnostics = [createDiagnostic()];
		const config: NestjsDoctorConfig = {};
		expect(filterIgnoredDiagnostics(diagnostics, config)).toEqual(diagnostics);
	});

	it("filters diagnostics matching ignored rules", () => {
		const diagnostics = [
			createDiagnostic({ rule: "architecture/no-god-service" }),
			createDiagnostic({ rule: "architecture/no-orm-in-services" }),
			createDiagnostic({ rule: "security/no-hardcoded-secrets" }),
		];
		const config: NestjsDoctorConfig = {
			ignore: {
				rules: [
					"architecture/no-god-service",
					"architecture/no-orm-in-services",
				],
			},
		};

		const filtered = filterIgnoredDiagnostics(diagnostics, config);
		expect(filtered).toHaveLength(1);
		expect(filtered[0].rule).toBe("security/no-hardcoded-secrets");
	});

	it("filters diagnostics matching ignored file patterns", () => {
		const diagnostics = [
			createDiagnostic({ filePath: "src/generated/types.ts" }),
			createDiagnostic({ filePath: "src/generated/api/client.ts" }),
			createDiagnostic({ filePath: "src/modules/users/users.service.ts" }),
		];
		const config: NestjsDoctorConfig = {
			ignore: {
				files: ["src/generated/**"],
			},
		};

		const filtered = filterIgnoredDiagnostics(diagnostics, config);
		expect(filtered).toHaveLength(1);
		expect(filtered[0].filePath).toBe("src/modules/users/users.service.ts");
	});

	it("filters by both rules and files together", () => {
		const diagnostics = [
			createDiagnostic({
				rule: "architecture/no-god-service",
				filePath: "src/app.module.ts",
			}),
			createDiagnostic({
				rule: "security/no-hardcoded-secrets",
				filePath: "src/generated/config.ts",
			}),
			createDiagnostic({
				rule: "correctness/prefer-readonly-injection",
				filePath: "src/modules/users/users.service.ts",
			}),
		];
		const config: NestjsDoctorConfig = {
			ignore: {
				rules: ["architecture/no-god-service"],
				files: ["src/generated/**"],
			},
		};

		const filtered = filterIgnoredDiagnostics(diagnostics, config);
		expect(filtered).toHaveLength(1);
		expect(filtered[0].rule).toBe("correctness/prefer-readonly-injection");
	});

	it("keeps all diagnostics when no rules or files match", () => {
		const diagnostics = [
			createDiagnostic({ rule: "architecture/no-god-service" }),
			createDiagnostic({ rule: "security/no-hardcoded-secrets" }),
		];
		const config: NestjsDoctorConfig = {
			ignore: {
				rules: ["nonexistent/rule"],
				files: ["nonexistent/**"],
			},
		};

		const filtered = filterIgnoredDiagnostics(diagnostics, config);
		expect(filtered).toHaveLength(2);
	});
});
