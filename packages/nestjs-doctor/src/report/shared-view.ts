import type {
	ReportArtifact,
	SerializedModuleGraph,
} from "../common/artifact.js";
import { REPORT_ARTIFACT_VERSION } from "../common/artifact.js";
import type { EndpointGraph } from "../common/endpoint.js";
import type { ProjectInfo, Score } from "../common/result.js";
import type { SharedReport } from "../common/share.js";
import { SHARED_REPORT_VERSION } from "../common/share.js";

export type ParsedReportFile =
	| { kind: "artifact"; artifact: ReportArtifact }
	| { kind: "shared"; shared: SharedReport }
	| { kind: "error"; error: string };

const NOT_A_REPORT =
	"This file is not a nestjs-doctor report. Load a report-json artifact or a shared file from the report's share dialog.";
const NEWER_FILE =
	"This file was made by a newer nestjs-doctor than this page understands. Regenerate it, or try again once the site updates.";

/** Classifies a report-json artifact vs a shared file by its version keys. */
export function parseReportFile(text: string): ParsedReportFile {
	let data: unknown;
	try {
		data = JSON.parse(text);
	} catch {
		return { kind: "error", error: NOT_A_REPORT };
	}
	if (typeof data !== "object" || data === null || Array.isArray(data)) {
		return { kind: "error", error: NOT_A_REPORT };
	}
	const record = data as Record<string, unknown>;
	if ("schemaVersion" in record) {
		if (record.schemaVersion !== REPORT_ARTIFACT_VERSION) {
			return { kind: "error", error: NEWER_FILE };
		}
		return { kind: "artifact", artifact: data as ReportArtifact };
	}
	if (typeof record.version === "number" && Array.isArray(record.sections)) {
		if (record.version !== SHARED_REPORT_VERSION) {
			return { kind: "error", error: NEWER_FILE };
		}
		return { kind: "shared", shared: data as SharedReport };
	}
	return { kind: "error", error: NOT_A_REPORT };
}

const EMPTY_SCORE: Score = { label: "", value: 0 };

function sharedGraph(shared: SharedReport): SerializedModuleGraph {
	const modules = shared.modules;
	if (!modules) {
		return {
			bootstrapRoots: [],
			circularDepRecommendations: {},
			circularDeps: [],
			edges: [],
			modules: [],
			projects: [],
			timingsAvailable: false,
			timingsTrace: {},
		};
	}
	return {
		bootstrapRoots: modules.bootstrapRoots ?? [],
		circularDepRecommendations: {},
		circularDeps: modules.circularDeps,
		edges: modules.edges,
		modules: modules.modules,
		projects: modules.projects,
		timingsAvailable: false,
		timingsTrace: {},
	};
}

function sharedEndpoints(shared: SharedReport): EndpointGraph {
	return {
		endpoints: (shared.endpoints ?? []).map((endpoint) => ({
			...endpoint,
			dependencies: [],
			endLine: 0,
			filePath: "",
			line: 0,
			returnType: null,
			swagger: null,
		})),
	};
}

/** Expands a shared file into the artifact shape the report app renders. */
export function sharedReportToArtifact(shared: SharedReport): ReportArtifact {
	const project: ProjectInfo = shared.project ?? {
		fileCount: 0,
		framework: null,
		moduleCount: shared.modules?.modules.length ?? 0,
		name: "shared report",
		nestVersion: null,
		orm: null,
	};
	const score = shared.score ?? EMPTY_SCORE;
	return {
		diagnostics: [...shared.findings, ...shared.schemaIssues],
		elapsedMs: 0,
		endpoints: sharedEndpoints(shared),
		examples: {},
		generatedAt: shared.generatedAt,
		generator: shared.generator,
		graph: sharedGraph(shared),
		monorepo: false,
		project,
		providers: [],
		ruleErrors: [],
		schema: shared.schema ?? { entities: [], orm: "", relations: [] },
		schemaVersion: REPORT_ARTIFACT_VERSION,
		scope: shared.scope,
		score,
		share: {
			filename: "nestjs-doctor-shared.json",
			findingsByCategory: {},
			project,
			score,
			sections: [],
			version: shared.version,
		},
		sources: {},
		summary: shared.summary,
	};
}

/** Tabs a shared file cannot fill; schema and endpoints hide on their own. */
export function sharedHiddenTabs(shared: SharedReport): string[] {
	const hidden = ["lab"];
	if (!shared.sections.includes("score")) {
		hidden.push("summary");
	}
	if (!shared.sections.some((section) => section.startsWith("findings:"))) {
		hidden.push("diagnosis");
	}
	if (!shared.sections.includes("modules")) {
		hidden.push("modules");
	}
	return hidden;
}

const TAB_ORDER = ["summary", "diagnosis", "modules", "endpoints", "schema"];

/** First tab that has something to show, mirroring the tab bar's hiding. */
export function initialTab(
	artifact: ReportArtifact,
	hiddenTabs: string[]
): string {
	for (const tab of TAB_ORDER) {
		if (hiddenTabs.includes(tab)) {
			continue;
		}
		if (tab === "schema" && artifact.schema.entities.length === 0) {
			continue;
		}
		if (tab === "endpoints" && artifact.endpoints.endpoints.length === 0) {
			continue;
		}
		return tab;
	}
	return "summary";
}
