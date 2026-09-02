import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { reportScanTelemetry } from "../../src/cli/scan-telemetry-reporter.js";
import {
	buildAnalysisContext,
	buildResult,
	diagnose,
	type RawDiagnosticOutput,
	resolveScanConfig,
} from "../../src/engine/scanner.js";
import type { ScanPayload } from "../../src/telemetry/scan-telemetry.js";

const FIXTURES = resolve(import.meta.dirname, "../fixtures");

type Result = Awaited<ReturnType<typeof buildResult>>["result"];

async function analyze(fixture: string): Promise<Result> {
	const targetPath = resolve(FIXTURES, fixture);
	const scanConfig = await resolveScanConfig(targetPath);
	const context = await buildAnalysisContext(targetPath, scanConfig);
	const raw = await diagnose(context);
	return buildResult(context, raw, scanConfig.customRuleWarnings).result;
}

const lineOf = (d: { line?: number }): number => d.line ?? -1;

/** What the app fixture's directives silence, per rule id. */
const APP_SUPPRESSIONS = {
	"architecture/no-orm-in-controllers": 1,
	"schema/require-primary-key": 1,
	"schema/require-timestamps": 1,
	"security/no-eval": 9,
};

// Inline suppression runs through the real analyze pipeline
// (buildAnalysisContext → diagnose → buildResult), which exercises the actual
// source-text resolver — the only path that can catch a filePath/resolver
// mismatch. Assertions are line-precise so a right-count/wrong-line failure
// (one suppression silently misfiring while another over-suppresses) can't hide.
describe("inline suppression (integration)", () => {
	describe("Prisma schema directives — the .prisma disk-read fix", () => {
		let result: Result;

		beforeAll(async () => {
			result = await analyze("inline-suppressions-prisma");
		});

		it("detects Prisma", () => {
			expect(result.project.orm).toBe("prisma");
		});

		// Before the fix, `.prisma` files were absent from the ts-morph project,
		// so this `-file` directive was silently ignored and AuditLog was flagged.
		it("suppresses schema/require-primary-key via -file in the .prisma file", () => {
			const pk = result.diagnostics.filter(
				(d) => d.rule === "schema/require-primary-key"
			);
			expect(pk).toHaveLength(0);
		});

		it("does NOT suppress the unlisted rule require-timestamps (specificity)", () => {
			const ts = result.diagnostics.filter(
				(d) => d.rule === "schema/require-timestamps"
			);
			expect(ts).toHaveLength(1);
			expect("entity" in ts[0] && ts[0].entity).toBe("AuditLog");
		});

		it("leaves exactly one schema diagnostic and a clean User model", () => {
			const schema = result.diagnostics.filter((d) => d.category === "schema");
			expect(schema).toHaveLength(1);
			const userDiags = result.diagnostics.filter(
				(d) => "entity" in d && d.entity === "User"
			);
			expect(userDiags).toHaveLength(0);
		});
	});

	describe("code-rule directive forms (unchanged .ts path)", () => {
		let result: Result;

		beforeAll(async () => {
			result = await analyze("inline-suppressions-app");
		});

		const evalIn = (suffix: string) =>
			result.diagnostics.filter(
				(d) => d.rule === "security/no-eval" && d.filePath.endsWith(suffix)
			);

		it("detects MikroORM", () => {
			expect(result.project.orm).toBe("mikro-orm");
		});

		// security.service.ts runs `eval` on 10 lines. Cases A-G (lines 9,14,20,
		// 25,30,35,40) each use a different directive form and must be suppressed;
		// the negative controls remain:
		//   L45 (H) no directive · L50 (I) misspelled `-lines` · L55 (J) wrong rule
		it("suppresses every directive FORM and keeps the negative controls", () => {
			const lines = evalIn("security.service.ts")
				.map(lineOf)
				.sort((a, b) => a - b);
			expect(lines).toEqual([45, 50, 55]);
		});

		it("suppresses a rule file-wide via -file (security-file.service.ts)", () => {
			expect(evalIn("security-file.service.ts")).toHaveLength(0);
		});

		// gap 1: a directive that only appears inside a string literal must not
		// suppress the real eval() on the next line.
		it("does not treat a directive inside a string literal as real", () => {
			expect(evalIn("string-literal.service.ts")).toHaveLength(1);
		});

		it("suppresses an architecture rule inline, control still fires", () => {
			const orm = result.diagnostics.filter(
				(d) => d.rule === "architecture/no-orm-in-controllers"
			);
			expect(orm).toHaveLength(1);
			// L18 is UnsuppressedController; the L8 constructor is silenced inline.
			expect(lineOf(orm[0])).toBe(18);
		});

		it("suppresses .ts schema rules via -file (Payment entity, path unchanged by the fix)", () => {
			const paymentSchema = result.diagnostics.filter(
				(d) =>
					d.category === "schema" && "entity" in d && d.entity === "Payment"
			);
			expect(paymentSchema).toHaveLength(0);
		});
	});

	describe("suppression counts", () => {
		let raw: RawDiagnosticOutput;
		let payload: ScanPayload;

		beforeAll(async () => {
			const targetPath = resolve(FIXTURES, "inline-suppressions-app");
			const scanConfig = await resolveScanConfig(targetPath);
			const context = await buildAnalysisContext(targetPath, scanConfig);
			raw = await diagnose(context);
			const scanResult = buildResult(
				context,
				raw,
				scanConfig.customRuleWarnings
			);
			reportScanTelemetry({
				blocking: "error",
				diagnostics: scanResult.result.diagnostics,
				env: {},
				fileCount: context.files.length,
				isEnabled: () => true,
				monorepo: false,
				optionsTelemetry: true,
				outputFormat: "console",
				resolveIdentityFn: () => ({
					anonymousId: "anon",
					projectId: "proj",
					stored: true,
				}),
				result: scanResult.result,
				scanConfig,
				scanId: "8f1c4a2e-0b3d-4f56-9a71-2c5d8e0f3b64",
				scopeRequested: "full",
				send: (sent) => {
					payload = sent;
					return true;
				},
				subProjectOptOut: false,
				suppressed: raw.suppressed,
				targetPath,
				totalMs: 1,
			});
		});

		// The file loop and checkProject each run processResults; a rule silenced
		// once must be counted once.
		it("counts a suppression once across the file loop and the project rules", () => {
			expect(raw.suppressed).toEqual(APP_SUPPRESSIONS);
		});

		it("reports the per-rule counts in the telemetry payload", () => {
			expect(payload.suppressed_inline).toEqual(APP_SUPPRESSIONS);
		});
	});
});
