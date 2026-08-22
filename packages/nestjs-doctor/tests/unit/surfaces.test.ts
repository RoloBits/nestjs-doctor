import { describe, expect, it } from "vitest";
import type {
	CodeDiagnostic,
	Diagnostic,
	DiagnosticSurface,
	SchemaDiagnostic,
} from "../../src/common/diagnostic.js";
import { forSurface, onSurface } from "../../src/common/diagnostic.js";
import type { DiagnoseResult } from "../../src/common/result.js";
import { withSurface } from "../../src/engine/result-builder.js";
import {
	runProjectRules,
	runSchemaRules,
} from "../../src/engine/rule-runner.js";
import { filterRules } from "../../src/engine/rules/rule-pipeline.js";
import type {
	ProjectRule,
	Rule,
	SchemaRule,
} from "../../src/engine/rules/types.js";

const ALL: DiagnosticSurface[] = ["cli", "prComment", "score", "ciFailure"];

const code = (overrides: Partial<CodeDiagnostic> = {}): CodeDiagnostic => ({
	filePath: "/repo/src/a.ts",
	rule: "test/rule",
	category: "correctness",
	severity: "warning",
	message: "something",
	help: "fix it",
	line: 1,
	column: 1,
	...overrides,
});

describe("onSurface", () => {
	it("shows a diagnostic everywhere when it names no surface", () => {
		const d = code();

		expect(ALL.every((s) => onSurface(d, s))).toBe(true);
	});

	it("shows it only where it is named", () => {
		const d = code({ surfaces: ["cli", "prComment"] });

		expect(onSurface(d, "cli")).toBe(true);
		expect(onSurface(d, "prComment")).toBe(true);
		expect(onSurface(d, "score")).toBe(false);
		expect(onSurface(d, "ciFailure")).toBe(false);
	});

	it("shows it nowhere when the list is empty", () => {
		const d = code({ surfaces: [] });

		expect(ALL.some((s) => onSurface(d, s))).toBe(false);
	});

	it("matches a whole surface name, not a fragment of one", () => {
		// `includes` on a string would let "cli" match "c".
		const d = code({ surfaces: ["ciFailure"] });

		expect(onSurface(d, "cli")).toBe(false);
		expect(onSurface(d, "ciFailure")).toBe(true);
	});

	it("treats a schema diagnostic the same way", () => {
		const d: SchemaDiagnostic = {
			filePath: "/repo/schema.prisma",
			rule: "schema/require-primary-key",
			category: "schema",
			severity: "warning",
			message: "no primary key",
			help: "add one",
			entity: "User",
			surfaces: ["cli"],
		};

		expect(onSurface(d, "cli")).toBe(true);
		expect(onSurface(d, "score")).toBe(false);
	});
});

describe("forSurface", () => {
	const reportOnly = code({ surfaces: ["cli"], message: "report only" });
	const everywhere = code({ message: "everywhere" });
	const nowhere = code({ surfaces: [], message: "nowhere" });

	it("keeps what the surface may show, in order", () => {
		const kept = forSurface([reportOnly, everywhere, nowhere], "cli");

		expect(kept.map((d) => d.message)).toEqual(["report only", "everywhere"]);
	});

	it("drops the report-only finding from a gating surface", () => {
		expect(forSurface([reportOnly, everywhere], "score")).toEqual([everywhere]);
		expect(forSurface([reportOnly, everywhere], "ciFailure")).toEqual([
			everywhere,
		]);
	});

	it("returns nothing when no diagnostic reaches the surface", () => {
		expect(forSurface([reportOnly], "prComment")).toEqual([]);
	});
});

describe("withSurface", () => {
	const resultWith = (diagnostics: Diagnostic[]): DiagnoseResult =>
		({
			score: { value: 72, label: "Fair", stars: 3 },
			diagnostics,
			project: { name: "t", fileCount: 3, moduleCount: 1 },
			summary: {
				total: diagnostics.length,
				errors: 0,
				warnings: diagnostics.length,
				info: 0,
				byCategory: {},
			},
			ruleErrors: [],
			elapsedMs: 1,
		}) as unknown as DiagnoseResult;

	it("leaves the score alone, because it describes the whole project", () => {
		const narrowed = withSurface(
			resultWith([code({ surfaces: ["cli"] }), code()]),
			"score"
		);

		expect(narrowed.diagnostics).toHaveLength(1);
		expect(narrowed.score.value).toBe(72);
	});

	it("recomputes the summary to match what it kept", () => {
		const narrowed = withSurface(
			resultWith([
				code({ surfaces: ["cli"], severity: "error" }),
				code({ severity: "warning" }),
			]),
			"prComment"
		);

		expect(narrowed.summary.total).toBe(1);
		expect(narrowed.summary.errors).toBe(0);
		expect(narrowed.summary.warnings).toBe(1);
	});

	it("returns the same object when the surface drops nothing", () => {
		const result = resultWith([code(), code()]);

		expect(withSurface(result, "cli")).toBe(result);
	});

	it("narrows to an empty set without touching the score", () => {
		const narrowed = withSurface(resultWith([code({ surfaces: [] })]), "cli");

		expect(narrowed.diagnostics).toEqual([]);
		expect(narrowed.score.value).toBe(72);
	});
});

describe("surfaces reach every rule scope", () => {
	const meta = {
		category: "correctness" as const,
		severity: "warning" as const,
		description: "d",
		help: "h",
		surfaces: ["cli", "prComment"] as DiagnosticSurface[],
	};

	it("stamps a project rule's surfaces onto its diagnostics", () => {
		const rule: ProjectRule = {
			meta: { ...meta, id: "test/project", scope: "project" },
			check: (context) => {
				context.report({
					filePath: "/repo/package.json",
					line: 1,
					column: 1,
					message: "m",
					help: "h",
				});
			},
		};
		const { diagnostics } = runProjectRules(
			{ getSourceFiles: () => [] } as never,
			[],
			[rule],
			{
				config: {} as never,
				moduleGraph: { modules: new Map() } as never,
				providers: new Map(),
				targetPath: "/repo",
			}
		);

		expect(diagnostics[0].surfaces).toEqual(["cli", "prComment"]);
	});

	it("stamps a schema rule's surfaces onto its diagnostics", () => {
		const rule: SchemaRule = {
			meta: { ...meta, id: "test/schema", scope: "schema", category: "schema" },
			check: (context) => {
				context.report({
					filePath: "/repo/schema.prisma",
					entity: "User",
					message: "m",
					help: "h",
				});
			},
		};
		const { diagnostics } = runSchemaRules(
			{ entities: [], relations: [], orm: "prisma" } as never,
			[rule]
		);

		expect(diagnostics[0].surfaces).toEqual(["cli", "prComment"]);
	});
});

describe("configured surfaces", () => {
	const rule: Rule = {
		meta: {
			id: "correctness/example",
			category: "correctness",
			severity: "warning",
			description: "d",
			help: "h",
		},
		check: () => [],
	};

	const surfacesOf = (value: unknown): unknown =>
		filterRules({ rules: { "correctness/example": value } } as never, [rule])[0]
			?.meta.surfaces;

	it("ignores an override that is not a list", () => {
		expect(surfacesOf({ surfaces: "cli" })).toBeUndefined();
	});

	it("ignores an override naming an unknown surface", () => {
		expect(surfacesOf({ surfaces: ["cli", "telepathy"] })).toBeUndefined();
	});

	it("ignores an empty override rather than hiding the rule", () => {
		expect(surfacesOf({ surfaces: [] })).toBeUndefined();
	});

	it("applies an override naming known surfaces", () => {
		expect(surfacesOf({ surfaces: ["score"] })).toEqual(["score"]);
	});
});
