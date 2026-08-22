import type { Diagnostic } from "nestjs-doctor";
import { describe, expect, it } from "vitest";
import { DiagnosticSeverity } from "vscode-languageserver";
import { groupByFile } from "../src/convert.js";

const ROOT = "/repo";

const code = (overrides: Partial<Diagnostic> = {}): Diagnostic =>
	({
		rule: "performance/no-sync-io",
		category: "performance",
		severity: "warning",
		filePath: "/repo/src/a.service.ts",
		message: "Synchronous I/O blocks the event loop.",
		help: "Use the async variant.",
		line: 4,
		column: 3,
		...overrides,
	}) as Diagnostic;

const only = (diagnostics: Diagnostic[]) => {
	const grouped = groupByFile(diagnostics, ROOT);
	const [first] = [...grouped.values()];
	return first;
};

describe("editor severity by surface", () => {
	it("keeps the rule's own severity when it declares no surfaces", () => {
		const [lsp] = only([code()]);

		expect(lsp.severity).toBe(DiagnosticSeverity.Warning);
		expect(lsp.data).toMatchObject({ advisory: false });
	});

	it("keeps it for a rule that still scores", () => {
		const [lsp] = only([code({ surfaces: ["cli", "score"] })]);

		expect(lsp.severity).toBe(DiagnosticSeverity.Warning);
	});

	it("keeps it for a rule that fails a build without scoring", () => {
		const [lsp] = only([code({ surfaces: ["cli", "ciFailure"] })]);

		expect(lsp.severity).toBe(DiagnosticSeverity.Warning);
		expect(lsp.data).toMatchObject({ advisory: false });
	});

	it("demotes to a hint only when it can neither score nor gate", () => {
		const [lsp] = only([
			code({
				rule: "correctness/prefer-readonly-injection",
				surfaces: ["cli"],
			}),
		]);

		expect(lsp.severity).toBe(DiagnosticSeverity.Hint);
		expect(lsp.data).toMatchObject({ advisory: true });
	});

	it("demotes an error the same way, since severity is not the question", () => {
		const [lsp] = only([code({ severity: "error", surfaces: ["cli"] })]);

		expect(lsp.severity).toBe(DiagnosticSeverity.Hint);
	});

	it("maps each severity when the finding is not advisory", () => {
		const severities = only([
			code({ severity: "error", line: 1 }),
			code({ severity: "warning", line: 2 }),
			code({ severity: "info", line: 3 }),
		]).map((d) => d.severity);

		expect(severities).toEqual([
			DiagnosticSeverity.Error,
			DiagnosticSeverity.Warning,
			DiagnosticSeverity.Information,
		]);
	});
});

describe("groupByFile", () => {
	it("converts to a file URI and groups every finding under it", () => {
		const grouped = groupByFile([code({ line: 1 }), code({ line: 2 })], ROOT);

		expect([...grouped.keys()]).toEqual(["file:///repo/src/a.service.ts"]);
		expect(grouped.get("file:///repo/src/a.service.ts")).toHaveLength(2);
	});

	it("resolves a relative path against the workspace root", () => {
		const grouped = groupByFile([code({ filePath: "src/b.ts" })], ROOT);

		expect([...grouped.keys()]).toEqual(["file:///repo/src/b.ts"]);
	});

	it("converts one-based positions to the editor's zero-based range", () => {
		const [lsp] = only([code({ line: 4, column: 3 })]);

		expect(lsp.range).toEqual({
			start: { line: 3, character: 2 },
			end: { line: 3, character: 2 },
		});
	});

	it("clamps a zero line to the top of the file rather than going negative", () => {
		const [lsp] = only([code({ line: 0, column: 0 })]);

		expect(lsp.range.start).toEqual({ line: 0, character: 0 });
	});

	it("puts a schema finding, which carries no line, on line one", () => {
		const [lsp] = only([
			{
				rule: "schema/require-primary-key",
				category: "schema",
				severity: "error",
				filePath: "/repo/prisma/schema.prisma",
				message: "Entity 'User' has no primary key.",
				help: "Add one.",
				entity: "User",
			} as Diagnostic,
		]);

		expect(lsp.range.start).toEqual({ line: 0, character: 0 });
		expect(lsp.severity).toBe(DiagnosticSeverity.Error);
	});
});
