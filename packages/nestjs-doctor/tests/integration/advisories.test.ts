import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { shouldBlock } from "../../src/cli/blocking.js";
import { renderResult } from "../../src/cli/formatters/render.js";
import type {
	Diagnostic,
	DiagnosticSurface,
} from "../../src/common/diagnostic.js";
import { forSurface } from "../../src/common/diagnostic.js";
import type { DiagnoseResult } from "../../src/common/result.js";
import {
	buildAnalysisContext,
	buildResult,
	diagnose,
	resolveScanConfig,
} from "../../src/engine/scanner.js";

const FIXTURE = resolve(import.meta.dirname, "../fixtures/vulnerable-deps");

/**
 * The fixture declares one case per resolution path, and carries no
 * `node_modules`, so every version comes from the spec.
 */
describe("the vulnerable-deps fixture", () => {
	let result: DiagnoseResult;
	let advisories: Diagnostic[];

	beforeAll(async () => {
		const scanConfig = await resolveScanConfig(FIXTURE);
		const context = await buildAnalysisContext(FIXTURE, scanConfig);
		result = buildResult(
			context,
			await diagnose(context),
			scanConfig.customRuleWarnings
		).result;
		advisories = result.diagnostics.filter((d) =>
			d.rule.endsWith("-nestjs-packages")
		);
	});

	const forPackage = (name: string): Diagnostic[] =>
		advisories.filter((d) => d.message.includes(name));

	it("reports an exact pin below the fix, at error severity", () => {
		const found = forPackage("@nestjs/devtools-integration");

		expect(found).toHaveLength(1);
		expect(found[0].severity).toBe("error");
		expect(found[0].message).toContain("CVE-2025-54782");
	});

	it("reports every advisory against one package, not just the first", () => {
		const found = forPackage("@nestjs/platform-fastify");

		expect(found).toHaveLength(3);
		expect(new Set(found.map((d) => d.message)).size).toBe(3);
	});

	it("reports a range whose every version is below the fix", () => {
		const found = forPackage("@nestjs/core at ^10.0.0");

		expect(found).toHaveLength(1);
		expect(found[0].severity).toBe("warning");
	});

	it("stays quiet where the range admits the fix", () => {
		// @nestjs/common's 10.x line is fixed in 10.4.16, which ^10.0.0 allows.
		expect(forPackage("@nestjs/common")).toEqual([]);
	});

	it("says so for a spec that names no version", () => {
		const found = forPackage("@nestjs/microservices");

		expect(found).toHaveLength(1);
		expect(found[0].message).toContain("Could not establish");
	});

	it("anchors each finding on the line that declares it", () => {
		const lineOf = (name: string): number | undefined =>
			forPackage(name)[0]?.line;

		expect(lineOf("@nestjs/core at ^10.0.0")).toBe(5);
		expect(lineOf("@nestjs/platform-fastify")).toBe(7);
		// devDependencies, so a later line than any dependency.
		expect(lineOf("@nestjs/devtools-integration")).toBe(11);
	});

	it("names the file that actually holds the dependencies", () => {
		for (const found of advisories) {
			expect(found.filePath.endsWith("/package.json")).toBe(true);
		}
	});

	it("splits severity across the two rules", () => {
		const bySeverity = (rule: string): string[] => [
			...new Set(
				advisories.filter((d) => d.rule === rule).map((d) => d.severity)
			),
		];

		expect(bySeverity("security/no-vulnerable-nestjs-packages")).toEqual([
			"error",
		]);
		expect(bySeverity("security/no-advisory-nestjs-packages")).toEqual([
			"warning",
		]);
	});
});

describe("what each surface sees of the fixture", () => {
	let result: DiagnoseResult;

	beforeAll(async () => {
		const scanConfig = await resolveScanConfig(FIXTURE);
		const context = await buildAnalysisContext(FIXTURE, scanConfig);
		result = buildResult(
			context,
			await diagnose(context),
			scanConfig.customRuleWarnings
		).result;
	});

	const advisoriesOn = (surface: DiagnosticSurface): Diagnostic[] =>
		forSurface(result.diagnostics, surface).filter((d) =>
			d.rule.endsWith("-nestjs-packages")
		);

	it("shows both rules on the console and the pull request", () => {
		for (const surface of ["cli", "prComment"] as const) {
			const rules = new Set(advisoriesOn(surface).map((d) => d.rule));
			expect(rules).toContain("security/no-vulnerable-nestjs-packages");
			expect(rules).toContain("security/no-advisory-nestjs-packages");
		}
	});

	it("keeps the warning rule out of the score and the build", () => {
		for (const surface of ["score", "ciFailure"] as const) {
			const rules = new Set(advisoriesOn(surface).map((d) => d.rule));
			expect(rules).toContain("security/no-vulnerable-nestjs-packages");
			expect(rules).not.toContain("security/no-advisory-nestjs-packages");
		}
	});

	it("fails a build on the error rule alone", () => {
		expect(shouldBlock(result.diagnostics, "error")).toBe(true);

		const withoutErrors = result.diagnostics.filter(
			(d) => d.rule !== "security/no-vulnerable-nestjs-packages"
		);
		// Only the report-only advisory warning is left, so nothing gates.
		expect(
			shouldBlock(
				withoutErrors.filter((d) => d.rule.endsWith("-nestjs-packages")),
				"warning"
			)
		).toBe(false);
	});

	it("hands the json format everything, tagged with its surfaces", () => {
		const payload = JSON.parse(
			renderResult("json", result, {
				targetPath: FIXTURE,
				version: "1.0.0",
			}) as string
		) as { diagnostics: Diagnostic[] };
		const advisories = payload.diagnostics.filter((d) =>
			d.rule.endsWith("-nestjs-packages")
		);

		expect(advisories).toHaveLength(
			result.diagnostics.filter((d) => d.rule.endsWith("-nestjs-packages"))
				.length
		);
		expect(
			advisories.find((d) => d.rule === "security/no-advisory-nestjs-packages")
				?.surfaces
		).toEqual(["cli", "prComment"]);
	});
});
