import { describe, expect, it } from "vitest";
import type { Diagnostic as LspDiagnostic } from "vscode-languageserver/node";
import { diagnosticsEqual, publishDiagnostics } from "../src/publish.js";

const diag = (overrides: Partial<LspDiagnostic> = {}): LspDiagnostic =>
	({
		range: {
			start: { line: 3, character: 2 },
			end: { line: 3, character: 2 },
		},
		severity: 2,
		code: "performance/no-sync-io",
		source: "nestjs-doctor",
		message: "Synchronous I/O blocks the event loop.",
		...overrides,
	}) as LspDiagnostic;

const recorder = () => {
	const sent: Array<{ uri: string; diagnostics: LspDiagnostic[] }> = [];
	return {
		sent,
		send: (uri: string, diagnostics: LspDiagnostic[]) => {
			sent.push({ uri, diagnostics });
		},
	};
};

const A = "file:///proj/a.ts";
const B = "file:///proj/b.ts";

describe("publishDiagnostics", () => {
	it("sends every file on the first scan", () => {
		const { sent, send } = recorder();

		publishDiagnostics(new Map(), new Map([[A, [diag()]]]), send);

		expect(sent).toEqual([{ uri: A, diagnostics: [diag()] }]);
	});

	it("clears a file whose findings are all gone", () => {
		const { sent, send } = recorder();
		const previous = new Map([[A, [diag()]]]);

		publishDiagnostics(previous, new Map(), send);

		expect(sent).toEqual([{ uri: A, diagnostics: [] }]);
	});

	it("says nothing about a file that did not change", () => {
		const { sent, send } = recorder();
		const previous = new Map([[A, [diag()]]]);

		publishDiagnostics(previous, new Map([[A, [diag()]]]), send);

		expect(sent).toEqual([]);
	});

	it("sends the file that changed and leaves the other alone", () => {
		const { sent, send } = recorder();
		const previous = new Map([
			[A, [diag()]],
			[B, [diag()]],
		]);
		const next = new Map([
			[A, [diag()]],
			[B, [diag({ message: "something else" })]],
		]);

		publishDiagnostics(previous, next, send);

		expect(sent.map((s) => s.uri)).toEqual([B]);
	});

	it("returns the new map so the next call compares against it", () => {
		const { send } = recorder();
		const next = new Map([[A, [diag()]]]);

		expect(publishDiagnostics(new Map(), next, send)).toBe(next);
	});

	it("clears one file while publishing another in the same pass", () => {
		const { sent, send } = recorder();
		const previous = new Map([[A, [diag()]]]);

		publishDiagnostics(previous, new Map([[B, [diag()]]]), send);

		expect(sent).toEqual([
			{ uri: A, diagnostics: [] },
			{ uri: B, diagnostics: [diag()] },
		]);
	});
});

describe("diagnosticsEqual", () => {
	it("is true for the same findings", () => {
		expect(diagnosticsEqual([diag()], [diag()])).toBe(true);
	});

	it.each([
		["a different count", [diag(), diag()]],
		["a different message", [diag({ message: "other" })]],
		["a different rule", [diag({ code: "correctness/other" })]],
		["a different severity", [diag({ severity: 1 })]],
		[
			"a moved line",
			[
				diag({
					range: {
						start: { line: 9, character: 2 },
						end: { line: 9, character: 2 },
					},
				}),
			],
		],
	])("is false for %s", (_label, other) => {
		expect(diagnosticsEqual([diag()], other as LspDiagnostic[])).toBe(false);
	});

	it("is true for two empty lists, so a clean file is not republished", () => {
		expect(diagnosticsEqual([], [])).toBe(true);
	});
});
