import { describe, expect, it } from "vitest";
import type {
	CodeDiagnostic,
	Diagnostic,
	SchemaDiagnostic,
} from "../../src/common/diagnostic.js";
import {
	countIdentities,
	diagnosticIdentity,
	diffDiagnostics,
	fingerprint,
	toRelativePath,
} from "../../src/engine/fingerprint.js";

const ROOT = "/repo";
const SHA256_HEX_RE = /^[0-9a-f]{64}$/;

const code = (
	overrides: Partial<CodeDiagnostic> & { line: number }
): CodeDiagnostic => ({
	rule: "performance/no-sync-io",
	category: "performance",
	severity: "warning",
	filePath: "/repo/src/a.service.ts",
	message: "Synchronous I/O call 'readFileSync()' blocks the event loop.",
	help: "Use the async variant.",
	column: 1,
	sourceLines: [{ line: overrides.line, text: '    readFileSync("/tmp/a");' }],
	...overrides,
});

const schema = (
	overrides: Partial<SchemaDiagnostic> = {}
): SchemaDiagnostic => ({
	rule: "schema/require-primary-key",
	category: "schema",
	severity: "error",
	filePath: "/repo/prisma/schema.prisma",
	message: "Entity 'User' has no primary key column.",
	help: "Add a primary key.",
	entity: "User",
	...overrides,
});

describe("toRelativePath", () => {
	it("returns a posix path relative to the target", () => {
		expect(toRelativePath("/repo", "/repo/src/a.ts")).toBe("src/a.ts");
	});

	it("stays relative when the file sits outside the target", () => {
		// An absolute path differs per machine, so the identity it feeds would
		// change between a local run and CI.
		expect(toRelativePath("/repo/src", "/elsewhere/b.ts")).toBe(
			"../../elsewhere/b.ts"
		);
		expect(toRelativePath("/repo/apps/api", "/repo/package.json")).toBe(
			"../../package.json"
		);
	});
});

describe("diagnosticIdentity", () => {
	it("is stable when the finding moves to a different line", () => {
		// The whole point of the baseline: an edit higher up in the file must not
		// turn an existing finding into a newly introduced one.
		const before = code({ line: 7 });
		const after = code({
			line: 42,
			sourceLines: [{ line: 42, text: '    readFileSync("/tmp/a");' }],
		});
		expect(diagnosticIdentity(after, ROOT)).toBe(
			diagnosticIdentity(before, ROOT)
		);
	});

	it("is stable across re-indentation of the anchor line", () => {
		const spaced = code({
			line: 7,
			sourceLines: [{ line: 7, text: '\t\treadFileSync(  "/tmp/a" );' }],
		});
		const tight = code({
			line: 7,
			sourceLines: [{ line: 7, text: 'readFileSync( "/tmp/a" );' }],
		});
		expect(diagnosticIdentity(spaced, ROOT)).toBe(
			diagnosticIdentity(tight, ROOT)
		);
	});

	it("differs when the source line actually changes", () => {
		const original = code({ line: 7 });
		const edited = code({
			line: 7,
			sourceLines: [{ line: 7, text: '    readFileSync("/tmp/OTHER");' }],
		});
		expect(diagnosticIdentity(edited, ROOT)).not.toBe(
			diagnosticIdentity(original, ROOT)
		);
	});

	it("differs across files, rules, and messages", () => {
		const base = diagnosticIdentity(code({ line: 3 }), ROOT);
		expect(
			diagnosticIdentity(code({ line: 3, filePath: "/repo/src/b.ts" }), ROOT)
		).not.toBe(base);
		expect(
			diagnosticIdentity(code({ line: 3, rule: "performance/no-eval" }), ROOT)
		).not.toBe(base);
		expect(
			diagnosticIdentity(code({ line: 3, message: "Something else." }), ROOT)
		).not.toBe(base);
	});

	it("separates schema findings by entity and column", () => {
		const user = diagnosticIdentity(schema(), ROOT);
		const order = diagnosticIdentity(schema({ entity: "Order" }), ROOT);
		const scoped = diagnosticIdentity(schema({ schemaColumn: "id" }), ROOT);
		expect(order).not.toBe(user);
		expect(scoped).not.toBe(user);
	});

	it("is comparable across two checkouts of the same repository", () => {
		const head = code({ line: 7 });
		const base = code({ line: 7, filePath: "/tmp/base-xyz/src/a.service.ts" });
		expect(diagnosticIdentity(base, "/tmp/base-xyz")).toBe(
			diagnosticIdentity(head, ROOT)
		);
	});
});

describe("fingerprint", () => {
	it("is a hex digest that tracks the identity", () => {
		const value = fingerprint(code({ line: 1 }), ROOT);
		expect(value).toMatch(SHA256_HEX_RE);
		expect(fingerprint(code({ line: 99 }), ROOT)).toBe(value);
	});
});

describe("countIdentities", () => {
	it("counts repeats rather than collapsing them", () => {
		const counts = countIdentities(
			[code({ line: 1 }), code({ line: 9 }), code({ line: 2, rule: "x/y" })],
			ROOT
		);
		expect([...counts.values()].sort()).toEqual([1, 2]);
	});
});

describe("diffDiagnostics", () => {
	const at = (line: number, text: string): CodeDiagnostic =>
		code({ line, sourceLines: [{ line, text }] });

	it("reports nothing when head and base match", () => {
		const head: Diagnostic[] = [at(1, "a()"), at(2, "b()")];
		const base: Diagnostic[] = [at(50, "a()"), at(60, "b()")];
		const delta = diffDiagnostics(head, base, ROOT, ROOT);
		expect(delta.introduced).toEqual([]);
		expect(delta.fixed).toBe(0);
	});

	it("reports only what the change added", () => {
		const added = at(3, "c()");
		const delta = diffDiagnostics(
			[at(1, "a()"), added],
			[at(1, "a()")],
			ROOT,
			ROOT
		);
		expect(delta.introduced).toEqual([added]);
		expect(delta.fixed).toBe(0);
	});

	it("counts what the change removed", () => {
		const delta = diffDiagnostics(
			[at(1, "a()")],
			[at(1, "a()"), at(2, "b()")],
			ROOT,
			ROOT
		);
		expect(delta.introduced).toEqual([]);
		expect(delta.fixed).toBe(1);
	});

	it("subtracts duplicates one at a time", () => {
		// Three identical findings that become four should report one new one —
		// not zero (set semantics) and not four.
		const head = [at(1, "a()"), at(2, "a()"), at(3, "a()"), at(4, "a()")];
		const base = [at(1, "a()"), at(2, "a()"), at(3, "a()")];
		const delta = diffDiagnostics(head, base, ROOT, ROOT);
		expect(delta.introduced).toHaveLength(1);
		expect(delta.fixed).toBe(0);
	});

	it("treats an empty base as everything being new", () => {
		const head = [at(1, "a()"), at(2, "b()")];
		expect(diffDiagnostics(head, [], ROOT, ROOT).introduced).toEqual(head);
	});
});
