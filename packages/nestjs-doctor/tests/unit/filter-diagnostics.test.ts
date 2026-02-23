import { describe, expect, it } from "vitest";
import { filterIgnoredDiagnostics } from "../../src/core/filter-diagnostics.js";
import type { NestjsDoctorConfig } from "../../src/types/config.js";
import type { Diagnostic } from "../../src/types/diagnostic.js";

const TARGET_PATH = "/Users/test/project";

const createDiagnostic = (overrides: Partial<Diagnostic> = {}): Diagnostic => ({
	filePath: `${TARGET_PATH}/src/app.service.ts`,
	rule: "architecture/no-business-logic-in-controllers",
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
		expect(filterIgnoredDiagnostics(diagnostics, config, TARGET_PATH)).toEqual(
			diagnostics
		);
	});

	it("filters diagnostics matching ignored rules", () => {
		const diagnostics = [
			createDiagnostic({
				rule: "architecture/no-business-logic-in-controllers",
			}),
			createDiagnostic({ rule: "architecture/no-orm-in-services" }),
			createDiagnostic({ rule: "security/no-hardcoded-secrets" }),
		];
		const config: NestjsDoctorConfig = {
			ignore: {
				rules: [
					"architecture/no-business-logic-in-controllers",
					"architecture/no-orm-in-services",
				],
			},
		};

		const filtered = filterIgnoredDiagnostics(diagnostics, config, TARGET_PATH);
		expect(filtered).toHaveLength(1);
		expect(filtered[0].rule).toBe("security/no-hardcoded-secrets");
	});

	it("filters diagnostics matching ignored file patterns with absolute paths", () => {
		const diagnostics = [
			createDiagnostic({ filePath: `${TARGET_PATH}/src/generated/types.ts` }),
			createDiagnostic({
				filePath: `${TARGET_PATH}/src/generated/api/client.ts`,
			}),
			createDiagnostic({
				filePath: `${TARGET_PATH}/src/modules/users/users.service.ts`,
			}),
		];
		const config: NestjsDoctorConfig = {
			ignore: {
				files: ["src/generated/**"],
			},
		};

		const filtered = filterIgnoredDiagnostics(diagnostics, config, TARGET_PATH);
		expect(filtered).toHaveLength(1);
		expect(filtered[0].filePath).toBe(
			`${TARGET_PATH}/src/modules/users/users.service.ts`
		);
	});

	it("filters by both rules and files together", () => {
		const diagnostics = [
			createDiagnostic({
				rule: "architecture/no-business-logic-in-controllers",
				filePath: `${TARGET_PATH}/src/app.module.ts`,
			}),
			createDiagnostic({
				rule: "security/no-hardcoded-secrets",
				filePath: `${TARGET_PATH}/src/generated/config.ts`,
			}),
			createDiagnostic({
				rule: "correctness/prefer-readonly-injection",
				filePath: `${TARGET_PATH}/src/modules/users/users.service.ts`,
			}),
		];
		const config: NestjsDoctorConfig = {
			ignore: {
				rules: ["architecture/no-business-logic-in-controllers"],
				files: ["src/generated/**"],
			},
		};

		const filtered = filterIgnoredDiagnostics(diagnostics, config, TARGET_PATH);
		expect(filtered).toHaveLength(1);
		expect(filtered[0].rule).toBe("correctness/prefer-readonly-injection");
	});

	it("keeps all diagnostics when no rules or files match", () => {
		const diagnostics = [
			createDiagnostic({
				rule: "architecture/no-business-logic-in-controllers",
			}),
			createDiagnostic({ rule: "security/no-hardcoded-secrets" }),
		];
		const config: NestjsDoctorConfig = {
			ignore: {
				rules: ["nonexistent/rule"],
				files: ["nonexistent/**"],
			},
		};

		const filtered = filterIgnoredDiagnostics(diagnostics, config, TARGET_PATH);
		expect(filtered).toHaveLength(2);
	});

	it("filters absolute paths with nested ignore patterns like src/database/migrations/**", () => {
		const diagnostics = [
			createDiagnostic({
				filePath: `${TARGET_PATH}/src/database/migrations/001-init.ts`,
			}),
			createDiagnostic({
				filePath: `${TARGET_PATH}/src/database/migrations/002-add-users.ts`,
			}),
			createDiagnostic({
				filePath: `${TARGET_PATH}/src/database/entities/user.entity.ts`,
			}),
			createDiagnostic({
				filePath: `${TARGET_PATH}/src/app.service.ts`,
			}),
		];
		const config: NestjsDoctorConfig = {
			ignore: {
				files: ["src/database/migrations/**"],
			},
		};

		const filtered = filterIgnoredDiagnostics(diagnostics, config, TARGET_PATH);
		expect(filtered).toHaveLength(2);
		expect(filtered.map((d) => d.filePath)).toEqual([
			`${TARGET_PATH}/src/database/entities/user.entity.ts`,
			`${TARGET_PATH}/src/app.service.ts`,
		]);
	});
});
