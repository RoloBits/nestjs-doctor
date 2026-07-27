import { describe, expect, it } from "vitest";
import {
	buildAnnotations,
	escapeCommandData,
	escapeCommandProperty,
} from "../../src/cli/formatters/github-reporter.js";
import {
	isOutputFormat,
	OUTPUT_FORMATS,
	validateFormatArg,
} from "../../src/cli/formatters/render.js";
import type {
	CodeDiagnostic,
	Diagnostic,
	SchemaDiagnostic,
} from "../../src/common/diagnostic.js";
import type { DiagnoseResult } from "../../src/common/result.js";
import { buildCodeQualityReport } from "../../src/formatters/gitlab-report.js";
import {
	buildMarkdownReport,
	MARKDOWN_COMMENT_MARKER,
} from "../../src/formatters/markdown-report.js";
import { buildSarifLog } from "../../src/formatters/sarif-report.js";

const ROOT = "/repo";
const SHA256_HEX_RE = /^[0-9a-f]{64}$/;

const code = (
	overrides: Partial<CodeDiagnostic> & { line: number }
): CodeDiagnostic => ({
	rule: "performance/no-sync-io",
	category: "performance",
	severity: "warning",
	filePath: "/repo/src/a.service.ts",
	message: "Synchronous I/O call blocks the event loop.",
	help: "Use the async variant.",
	column: 3,
	...overrides,
});

const schemaDiagnostic: SchemaDiagnostic = {
	rule: "schema/require-primary-key",
	category: "schema",
	severity: "error",
	filePath: "/repo/prisma/schema.prisma",
	message: "Entity 'User' has no primary key column.",
	help: "Add a primary key.",
	entity: "User",
};

const resultWith = (diagnostics: Diagnostic[]): DiagnoseResult => ({
	score: { value: 72, label: "Fair" },
	diagnostics,
	project: {
		name: "app",
		nestVersion: "11.0.0",
		orm: "prisma",
		framework: "express",
		fileCount: 10,
		moduleCount: 3,
	},
	summary: {
		total: diagnostics.length,
		errors: diagnostics.filter((d) => d.severity === "error").length,
		warnings: diagnostics.filter((d) => d.severity === "warning").length,
		info: diagnostics.filter((d) => d.severity === "info").length,
		byCategory: {
			security: 0,
			performance: diagnostics.filter((d) => d.category === "performance")
				.length,
			correctness: 0,
			architecture: 0,
			schema: diagnostics.filter((d) => d.category === "schema").length,
		},
	},
	ruleErrors: [],
	elapsedMs: 12,
});

describe("output formats", () => {
	it("lists every supported format", () => {
		expect(OUTPUT_FORMATS).toEqual([
			"console",
			"json",
			"sarif",
			"gitlab",
			"markdown",
			"github",
		]);
	});

	it("validates the format argument", () => {
		expect(isOutputFormat("sarif")).toBe(true);
		expect(isOutputFormat("xml")).toBe(false);
		expect(validateFormatArg("gitlab")).toBeNull();
		expect(validateFormatArg("xml")).toContain("console, json, sarif");
	});
});

describe("buildSarifLog", () => {
	const log = buildSarifLog(
		resultWith([code({ line: 8 }), schemaDiagnostic]),
		ROOT,
		"1.2.3"
	);

	it("emits SARIF 2.1.0 with a single run", () => {
		expect(log.version).toBe("2.1.0");
		expect(log.runs).toHaveLength(1);
		expect(log.runs[0].tool.driver.version).toBe("1.2.3");
	});

	it("resolves every result's ruleIndex into the catalogue", () => {
		const { rules, results } = {
			rules: log.runs[0].tool.driver.rules,
			results: log.runs[0].results,
		};
		for (const result of results) {
			expect(rules[result.ruleIndex]?.id).toBe(result.ruleId);
		}
	});

	it("maps severities onto SARIF levels", () => {
		expect(log.runs[0].results[0].level).toBe("warning");
		expect(log.runs[0].results[1].level).toBe("error");
	});

	it("reports repo-relative paths against a %SRCROOT% base", () => {
		const location = log.runs[0].results[0].locations[0].physicalLocation;
		expect(location.artifactLocation.uri).toBe("src/a.service.ts");
		expect(location.artifactLocation.uriBaseId).toBe("%SRCROOT%");
		expect(log.runs[0].originalUriBaseIds["%SRCROOT%"].uri).toContain("/repo/");
	});

	it("anchors a line-less schema finding at line 1, which SARIF requires", () => {
		expect(log.runs[0].results[1].locations[0].physicalLocation.region).toEqual(
			{
				startLine: 1,
			}
		);
	});

	it("sets a partial fingerprint on every result so alerts survive edits", () => {
		for (const result of log.runs[0].results) {
			expect(result.partialFingerprints["nestjsDoctor/v1"]).toMatch(
				SHA256_HEX_RE
			);
		}
	});

	it("synthesises a catalogue entry for a rule it does not know", () => {
		const custom = code({ line: 2, rule: "custom/no-todo-comments" });
		const customLog = buildSarifLog(resultWith([custom]), ROOT, "1.0.0");
		const result = customLog.runs[0].results[0];
		expect(customLog.runs[0].tool.driver.rules[result.ruleIndex].id).toBe(
			"custom/no-todo-comments"
		);
	});
});

describe("buildCodeQualityReport", () => {
	const issues = buildCodeQualityReport(
		resultWith([code({ line: 8 }), schemaDiagnostic]),
		ROOT
	);

	it("emits one entry per finding with the fields GitLab requires", () => {
		expect(issues).toHaveLength(2);
		for (const issue of issues) {
			expect(issue.description).toBeTruthy();
			expect(issue.check_name).toBeTruthy();
			expect(issue.fingerprint).toMatch(SHA256_HEX_RE);
			expect(issue.location.path.startsWith("/")).toBe(false);
			expect(issue.location.lines.begin).toBeGreaterThanOrEqual(1);
		}
	});

	it("maps severities onto GitLab's scale", () => {
		expect(issues[0].severity).toBe("minor");
		expect(issues[1].severity).toBe("major");
	});
});

describe("buildMarkdownReport", () => {
	const options = { targetPath: ROOT, version: "1.2.3" };

	it("starts with the sticky-comment marker", () => {
		const markdown = buildMarkdownReport(resultWith([]), options);
		expect(markdown.startsWith(MARKDOWN_COMMENT_MARKER)).toBe(true);
	});

	it("says so plainly when there is nothing to report", () => {
		expect(buildMarkdownReport(resultWith([]), options)).toContain(
			"No findings"
		);
	});

	it("lists findings with their location", () => {
		const markdown = buildMarkdownReport(
			resultWith([code({ line: 8 })]),
			options
		);
		expect(markdown).toContain("`src/a.service.ts:8`");
		expect(markdown).toContain("`performance/no-sync-io`");
	});

	it("escapes pipes so a message cannot break the table", () => {
		const markdown = buildMarkdownReport(
			resultWith([code({ line: 1, message: "a | b" })]),
			options
		);
		expect(markdown).toContain("a \\| b");
	});

	it("caps the table and says how many were left out", () => {
		const many = Array.from({ length: 60 }, (_, index) =>
			code({ line: index + 1 })
		);
		const markdown = buildMarkdownReport(resultWith(many), options);
		expect(markdown).toContain("and 10 more");
	});

	it("frames findings as introduced when reporting a baseline delta", () => {
		const result = {
			...resultWith([code({ line: 1 })]),
			scope: { mode: "changed" as const, fixed: 2, changedFiles: 1 },
		};
		const markdown = buildMarkdownReport(result, {
			...options,
			scope: result.scope,
		});
		expect(markdown).toContain("introduced by this change");
		expect(markdown).toContain("resolved 2 existing findings");
	});

	it("warns when the requested scope could not be honoured", () => {
		const scope = {
			mode: "files" as const,
			degradedFrom: "changed" as const,
			changedFiles: 3,
		};
		const markdown = buildMarkdownReport(
			{ ...resultWith([]), scope },
			{ ...options, scope }
		);
		expect(markdown).toContain("[!WARNING]");
		expect(markdown).toContain("fetch-depth: 0");
	});
});

describe("GitHub Actions annotations", () => {
	it("escapes message bodies and property values", () => {
		expect(escapeCommandData("50% of\nlines")).toBe("50%25 of%0Alines");
		expect(escapeCommandProperty("a:b,c")).toBe("a%3Ab%2Cc");
	});

	it("emits file, line, and column for a code finding", () => {
		const [line] = buildAnnotations(resultWith([code({ line: 8 })]), ROOT);
		expect(line).toContain("::warning ");
		expect(line).toContain("file=src/a.service.ts");
		expect(line).toContain("line=8");
		expect(line).toContain("col=3");
	});

	it("omits line and column for a schema finding", () => {
		const [line] = buildAnnotations(resultWith([schemaDiagnostic]), ROOT);
		expect(line).toContain("::error ");
		expect(line).not.toContain("line=");
	});

	it("caps each level at GitHub's per-step limit of ten", () => {
		// Beyond ten, GitHub drops annotations silently; the job summary and the
		// pull request comment carry the complete set instead.
		const many = Array.from({ length: 25 }, (_, index) =>
			code({ line: index + 1 })
		);
		expect(buildAnnotations(resultWith(many), ROOT)).toHaveLength(10);
	});
});
