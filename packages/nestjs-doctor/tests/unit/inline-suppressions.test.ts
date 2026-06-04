import { Project } from "ts-morph";
import { describe, expect, it, vi } from "vitest";
import type { Diagnostic } from "../../src/common/diagnostic.js";
import { isCodeDiagnostic } from "../../src/common/diagnostic.js";
import { filterSuppressedDiagnostics } from "../../src/engine/inline-suppressions.js";
import { runFileRules } from "../../src/engine/rule-runner.js";
import { noEval } from "../../src/engine/rules/definitions/security/no-eval.js";

const FILE = "/project/src/app.service.ts";

const codeDiagnostic = (overrides: Partial<Diagnostic> = {}): Diagnostic => ({
	filePath: FILE,
	rule: "security/no-eval",
	severity: "error",
	message: "Usage of eval() is a security risk.",
	help: "help",
	line: 1,
	column: 1,
	category: "security",
	...overrides,
});

const schemaDiagnostic = (overrides: Partial<Diagnostic> = {}): Diagnostic => ({
	filePath: FILE,
	rule: "schema/require-primary-key",
	severity: "warning",
	message: "Entity lacks a primary key.",
	help: "help",
	entity: "User",
	category: "schema",
	...overrides,
});

const fromText =
	(text: string) =>
	(filePath: string): string | undefined =>
		filePath === FILE ? text : undefined;

describe("filterSuppressedDiagnostics", () => {
	it("keeps everything when the file has no directives", () => {
		const diagnostics = [codeDiagnostic()];
		const result = filterSuppressedDiagnostics(
			diagnostics,
			fromText("const x = eval(payload);")
		);
		expect(result).toEqual(diagnostics);
	});

	it("keeps the diagnostic when source text is unavailable", () => {
		const diagnostics = [codeDiagnostic()];
		const result = filterSuppressedDiagnostics(diagnostics, () => undefined);
		expect(result).toEqual(diagnostics);
	});

	// ── disable-line ──

	it("suppresses a rule on the same line via a trailing comment", () => {
		const text =
			"const x = eval(payload); // nestjs-doctor-disable-line security/no-eval";
		const result = filterSuppressedDiagnostics(
			[codeDiagnostic({ line: 1 })],
			fromText(text)
		);
		expect(result).toHaveLength(0);
	});

	it("does not suppress other lines with disable-line", () => {
		const text = [
			"const a = eval(one); // nestjs-doctor-disable-line security/no-eval",
			"const b = eval(two);",
		].join("\n");
		const result = filterSuppressedDiagnostics(
			[codeDiagnostic({ line: 1 }), codeDiagnostic({ line: 2 })],
			fromText(text)
		);
		expect(result).toHaveLength(1);
		expect(isCodeDiagnostic(result[0]) && result[0].line).toBe(2);
	});

	it("does not suppress a different rule with a targeted disable-line", () => {
		const text =
			"const x = eval(payload); // nestjs-doctor-disable-line security/no-hardcoded-secrets";
		const result = filterSuppressedDiagnostics(
			[codeDiagnostic({ line: 1 })],
			fromText(text)
		);
		expect(result).toHaveLength(1);
	});

	// ── disable-next-line ──

	it("suppresses the line following a disable-next-line directive", () => {
		const text = [
			"// nestjs-doctor-disable-next-line security/no-eval",
			"const x = eval(payload);",
		].join("\n");
		const result = filterSuppressedDiagnostics(
			[codeDiagnostic({ line: 2 })],
			fromText(text)
		);
		expect(result).toHaveLength(0);
	});

	it("does not suppress the directive's own line with disable-next-line", () => {
		const text = [
			"// nestjs-doctor-disable-next-line security/no-eval",
			"const x = eval(payload);",
		].join("\n");
		const result = filterSuppressedDiagnostics(
			[codeDiagnostic({ line: 1 })],
			fromText(text)
		);
		expect(result).toHaveLength(1);
	});

	// ── disable-file ──

	it("suppresses a rule across the whole file with disable-file", () => {
		const text = [
			"// nestjs-doctor-disable-file security/no-eval",
			"const a = eval(one);",
			"const b = eval(two);",
		].join("\n");
		const result = filterSuppressedDiagnostics(
			[codeDiagnostic({ line: 2 }), codeDiagnostic({ line: 3 })],
			fromText(text)
		);
		expect(result).toHaveLength(0);
	});

	it("suppresses schema diagnostics (which have no line) only via disable-file", () => {
		const text = "// nestjs-doctor-disable-file schema/require-primary-key";
		const result = filterSuppressedDiagnostics(
			[schemaDiagnostic()],
			fromText(text)
		);
		expect(result).toHaveLength(0);
	});

	it("disable-line does not affect schema diagnostics", () => {
		const text = "// nestjs-doctor-disable-line schema/require-primary-key";
		const result = filterSuppressedDiagnostics(
			[schemaDiagnostic()],
			fromText(text)
		);
		expect(result).toHaveLength(1);
	});

	// ── rule lists ──

	it("suppresses every rule when no rule id is listed", () => {
		const text = "const x = eval(payload); // nestjs-doctor-disable-line";
		const result = filterSuppressedDiagnostics(
			[
				codeDiagnostic({ line: 1, rule: "security/no-eval" }),
				codeDiagnostic({ line: 1, rule: "correctness/no-empty-handlers" }),
			],
			fromText(text)
		);
		expect(result).toHaveLength(0);
	});

	it("supports comma- and space-separated rule lists", () => {
		const text =
			"// nestjs-doctor-disable-file security/no-eval, correctness/no-empty-handlers performance/no-sync-io";
		const result = filterSuppressedDiagnostics(
			[
				codeDiagnostic({ line: 2, rule: "security/no-eval" }),
				codeDiagnostic({ line: 3, rule: "correctness/no-empty-handlers" }),
				codeDiagnostic({ line: 4, rule: "performance/no-sync-io" }),
				codeDiagnostic({ line: 5, rule: "security/no-csrf-disabled" }),
			],
			fromText(text)
		);
		expect(result).toHaveLength(1);
		expect(result[0].rule).toBe("security/no-csrf-disabled");
	});

	it("ignores a -- reason trailer", () => {
		const text =
			"const x = eval(payload); // nestjs-doctor-disable-line security/no-eval -- legacy code, tracked in JIRA-123";
		const result = filterSuppressedDiagnostics(
			[codeDiagnostic({ line: 1 })],
			fromText(text)
		);
		expect(result).toHaveLength(0);
	});

	it("supports block comment directives", () => {
		const text =
			"const x = eval(payload); /* nestjs-doctor-disable-line security/no-eval */";
		const result = filterSuppressedDiagnostics(
			[codeDiagnostic({ line: 1 })],
			fromText(text)
		);
		expect(result).toHaveLength(0);
	});

	// ── verb aliases & bare form ──

	it("accepts the `ignore` verb as well as `disable`", () => {
		const text =
			"const x = eval(payload); // nestjs-doctor-ignore-line security/no-eval";
		const result = filterSuppressedDiagnostics(
			[codeDiagnostic({ line: 1 })],
			fromText(text)
		);
		expect(result).toHaveLength(0);
	});

	it("treats a bare `nestjs-doctor-ignore` as a same-line suppression", () => {
		const text =
			"const x = eval(payload); // nestjs-doctor-ignore security/no-eval";
		const result = filterSuppressedDiagnostics(
			[codeDiagnostic({ line: 1 })],
			fromText(text)
		);
		expect(result).toHaveLength(0);
	});

	it("supports `ignore-next-line` and `ignore-file`", () => {
		const next = filterSuppressedDiagnostics(
			[codeDiagnostic({ line: 2 })],
			fromText(
				["// nestjs-doctor-ignore-next-line security/no-eval", "eval(x);"].join(
					"\n"
				)
			)
		);
		expect(next).toHaveLength(0);

		const file = filterSuppressedDiagnostics(
			[codeDiagnostic({ line: 5 })],
			fromText("// nestjs-doctor-ignore-file security/no-eval")
		);
		expect(file).toHaveLength(0);
	});

	// ── robustness ──

	it("does not treat a misspelled directive as a suppression", () => {
		const text =
			"const x = eval(payload); // nestjs-doctor-disable-lines security/no-eval";
		const result = filterSuppressedDiagnostics(
			[codeDiagnostic({ line: 1 })],
			fromText(text)
		);
		expect(result).toHaveLength(1);
	});

	it("parses each file's source at most once", () => {
		const getText = vi.fn(
			fromText("// nestjs-doctor-disable-file security/no-eval")
		);
		filterSuppressedDiagnostics(
			[
				codeDiagnostic({ line: 2 }),
				codeDiagnostic({ line: 3 }),
				codeDiagnostic({ line: 4 }),
			],
			getText
		);
		expect(getText).toHaveBeenCalledTimes(1);
	});

	// ── end-to-end: line numbers reported by a real rule line up ──

	it("suppresses a real rule diagnostic at the reported line", () => {
		const source = [
			"export function run(payload: string) {",
			"  const a = eval(payload); // nestjs-doctor-disable-line security/no-eval",
			"  const b = eval(payload);",
			"}",
		].join("\n");

		const project = new Project({ useInMemoryFileSystem: true });
		const filePath = "/e2e/app.ts";
		project.createSourceFile(filePath, source);

		const { diagnostics } = runFileRules(project, [filePath], [noEval]);
		expect(diagnostics).toHaveLength(2);

		const result = filterSuppressedDiagnostics(diagnostics, (fp) =>
			project.getSourceFile(fp)?.getFullText()
		);

		expect(result).toHaveLength(1);
		expect(isCodeDiagnostic(result[0]) && result[0].line).toBe(3);
		expect(result[0].rule).toBe("security/no-eval");
	});
});
