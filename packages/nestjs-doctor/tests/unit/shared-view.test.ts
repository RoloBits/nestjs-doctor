import { describe, expect, it } from "vitest";
import type {
	CodeDiagnostic,
	SchemaDiagnostic,
} from "../../src/common/diagnostic.js";
import type { SharedReport } from "../../src/common/share.js";
import {
	initialTab,
	parseReportFile,
	sharedHiddenTabs,
	sharedReportToArtifact,
} from "../../src/report/shared-view.js";

const FINDING = {
	category: "security",
	column: 1,
	filePath: "src/app.service.ts",
	line: 3,
	message: "hardcoded secret",
	ruleId: "security/no-hardcoded-secrets",
	severity: "error",
} as CodeDiagnostic;

const SCHEMA_ISSUE = {
	category: "schema",
	entity: "User",
	message: "missing primary key",
	ruleId: "schema/require-primary-key",
	severity: "warning",
} as SchemaDiagnostic;

function shared(overrides: Partial<SharedReport> = {}): SharedReport {
	return {
		findings: [],
		generatedAt: "2026-08-28T00:00:00.000Z",
		generator: { name: "nestjs-doctor", version: "0.9.1" },
		includeCode: false,
		schemaIssues: [],
		sections: [],
		summary: {
			byCategory: {
				architecture: 0,
				correctness: 0,
				performance: 0,
				schema: 0,
				security: 0,
			},
			errors: 0,
			info: 0,
			total: 0,
			warnings: 0,
		},
		version: 1,
		...overrides,
	};
}

describe("parseReportFile", () => {
	it("classifies a report artifact by schemaVersion", () => {
		const parsed = parseReportFile('{"schemaVersion":1,"project":{}}');
		expect(parsed.kind).toBe("artifact");
	});

	it("classifies a shared file by version and sections", () => {
		const parsed = parseReportFile(JSON.stringify(shared()));
		expect(parsed.kind).toBe("shared");
	});

	it("rejects a newer artifact or shared file", () => {
		for (const text of [
			'{"schemaVersion":2}',
			JSON.stringify(shared({ version: 2 })),
		]) {
			const parsed = parseReportFile(text);
			expect(parsed.kind).toBe("error");
			expect(parsed.kind === "error" && parsed.error).toContain("newer");
		}
	});

	it("rejects non-report JSON and non-JSON text", () => {
		for (const text of ['{"foo":1}', "[1,2]", "not json", "3"]) {
			expect(parseReportFile(text).kind).toBe("error");
		}
	});
});

describe("sharedReportToArtifact", () => {
	it("merges findings and schema issues into diagnostics", () => {
		const artifact = sharedReportToArtifact(
			shared({ findings: [FINDING], schemaIssues: [SCHEMA_ISSUE] })
		);
		expect(artifact.diagnostics).toEqual([FINDING, SCHEMA_ISSUE]);
		expect(artifact.sources).toEqual({});
		expect(artifact.providers).toEqual([]);
	});

	it("defaults the project and score when the score section was not shared", () => {
		const artifact = sharedReportToArtifact(shared());
		expect(artifact.project.name).toBe("shared report");
		expect(artifact.score).toEqual({ label: "", value: 0 });
	});

	it("builds a graph from shared modules with timings off", () => {
		const artifact = sharedReportToArtifact(
			shared({
				sections: ["modules"],
				modules: {
					circularDeps: [],
					edges: [{ from: "AppModule", to: "UserModule" }],
					modules: [
						{
							controllers: [],
							exports: [],
							filePath: "src/app.module.ts",
							imports: ["UserModule"],
							name: "AppModule",
							providers: [],
						},
					],
					projects: [],
				},
			})
		);
		expect(artifact.graph.modules).toHaveLength(1);
		expect(artifact.graph.edges).toHaveLength(1);
		expect(artifact.graph.timingsAvailable).toBe(false);
		expect(artifact.project.moduleCount).toBe(1);
	});

	it("expands flat shared endpoints into endpoint nodes", () => {
		const artifact = sharedReportToArtifact(
			shared({
				sections: ["endpoints"],
				endpoints: [
					{
						controllerClass: "UserController",
						handlerMethod: "findAll",
						httpMethod: "GET",
						routePath: "/users",
					},
				],
			})
		);
		expect(artifact.endpoints.endpoints).toHaveLength(1);
		const endpoint = artifact.endpoints.endpoints[0];
		expect(endpoint.routePath).toBe("/users");
		expect(endpoint.dependencies).toEqual([]);
		expect(endpoint.swagger).toBeNull();
	});
});

describe("sharedHiddenTabs", () => {
	it("hides everything data-less for a score-only share", () => {
		expect(sharedHiddenTabs(shared({ sections: ["score"] }))).toEqual([
			"lab",
			"diagnosis",
			"modules",
		]);
	});

	it("keeps diagnosis for a findings share and summary hidden", () => {
		expect(
			sharedHiddenTabs(shared({ sections: ["findings:security"] }))
		).toEqual(["lab", "summary", "modules"]);
	});

	it("keeps modules when the modules section was picked", () => {
		expect(sharedHiddenTabs(shared({ sections: ["modules"] }))).toEqual([
			"lab",
			"summary",
			"diagnosis",
		]);
	});
});

describe("initialTab", () => {
	it("walks the tab order past hidden and empty tabs", () => {
		const scoreOnly = sharedReportToArtifact(shared({ sections: ["score"] }));
		expect(
			initialTab(scoreOnly, sharedHiddenTabs(shared({ sections: ["score"] })))
		).toBe("summary");

		const findingsOnly = shared({
			sections: ["findings:security"],
			findings: [FINDING],
		});
		expect(
			initialTab(
				sharedReportToArtifact(findingsOnly),
				sharedHiddenTabs(findingsOnly)
			)
		).toBe("diagnosis");

		const endpointsOnly = shared({
			sections: ["endpoints"],
			endpoints: [
				{
					controllerClass: "UserController",
					handlerMethod: "findAll",
					httpMethod: "GET",
					routePath: "/users",
				},
			],
		});
		expect(
			initialTab(
				sharedReportToArtifact(endpointsOnly),
				sharedHiddenTabs(endpointsOnly)
			)
		).toBe("endpoints");
	});
});
