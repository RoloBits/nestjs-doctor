import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { SerializedModuleGraph } from "../common/artifact.js";
import type {
	Category,
	CodeDiagnostic,
	SchemaDiagnostic,
} from "../common/diagnostic.js";
import {
	forSurface,
	isCodeDiagnostic,
	isSchemaDiagnostic,
} from "../common/diagnostic.js";
import type { DiagnoseResult } from "../common/result.js";
import type { SerializedSchemaEntity } from "../common/schema.js";
import type {
	ShareCategorySlice,
	SharedEndpoint,
	SharedModules,
	SharedReport,
	SharedSchema,
	ShareManifest,
	ShareSection,
} from "../common/share.js";
import { toRelativePath } from "../engine/fingerprint.js";
import { buildSummary } from "../engine/result-builder.js";

export const SHARED_REPORT_VERSION = 1;
const SHARED_FILENAME = "nestjs-doctor-shared.json";

const FINDINGS_PREFIX = "findings:";
export const SCORE_SECTION = "score";
export const SCHEMA_SECTION = "schema";
export const ENDPOINTS_SECTION = "endpoints";
export const MODULES_SECTION = "modules";
const FINDINGS_CATEGORIES: Category[] = [
	"security",
	"performance",
	"correctness",
	"architecture",
	"schema",
];

export type ShareSectionId =
	| "score"
	| "schema"
	| "endpoints"
	| "modules"
	| `${typeof FINDINGS_PREFIX}${Category}`;

/** Parses a `--share-sections` value; the string is what failed validation. */
export function parseShareSections(
	csv: string
): { sections: ShareSectionId[]; error?: undefined } | { error: string } {
	const valid = new Set<string>([
		SCORE_SECTION,
		SCHEMA_SECTION,
		ENDPOINTS_SECTION,
		MODULES_SECTION,
	]);
	for (const category of FINDINGS_CATEGORIES) {
		valid.add(`${FINDINGS_PREFIX}${category}`);
	}
	const sections: ShareSectionId[] = [];
	for (const raw of csv.split(",")) {
		const id = raw.trim();
		if (id.length === 0) {
			continue;
		}
		if (!valid.has(id)) {
			return {
				error: `Invalid --share-sections value: "${id}". Must be one of ${[...valid].join(", ")}.`,
			};
		}
		sections.push(id as ShareSectionId);
	}
	if (sections.length === 0) {
		return { error: "Invalid --share-sections value: no sections given." };
	}
	return { sections };
}

/**
 * The sections a result can offer, derived from its content so every
 * surface's picker shows only what exists.
 */
export function enumerateShareSections(
	result: DiagnoseResult,
	graph?: SerializedModuleGraph
): ShareSection[] {
	const sections: ShareSection[] = [
		{
			id: SCORE_SECTION,
			count: result.score.value,
			label: "Health score and project info",
		},
	];
	const cliDiagnostics = forSurface(result.diagnostics, "cli");
	for (const category of FINDINGS_CATEGORIES) {
		const count = cliDiagnostics.filter(
			(diagnostic) => diagnostic.category === category
		).length;
		if (count > 0) {
			sections.push({
				id: `${FINDINGS_PREFIX}${category}` as ShareSectionId,
				count,
				label: `Findings · ${category}`,
			});
		}
	}
	const endpointCount = result.endpoints?.endpoints.length ?? 0;
	if (endpointCount > 0) {
		sections.push({
			id: ENDPOINTS_SECTION,
			count: endpointCount,
			label: "HTTP endpoints",
		});
	}
	const entityCount = result.schema?.entities.length ?? 0;
	if (entityCount > 0) {
		sections.push({
			id: SCHEMA_SECTION,
			count: entityCount,
			label: "Relational schema",
		});
	}
	const moduleCount = graph?.modules.length ?? 0;
	if (moduleCount > 0) {
		sections.push({
			id: MODULES_SECTION,
			count: moduleCount,
			label: "Module graph",
		});
	}
	return sections;
}

/** One category's shareable diagnostics, paths relative to the scan root. */
function sliceCategory(
	result: DiagnoseResult,
	category: Category,
	relativePath: (filePath: string) => string
): ShareCategorySlice {
	const picked = forSurface(result.diagnostics, "cli").filter(
		(diagnostic) => diagnostic.category === category
	);
	const findings: CodeDiagnostic[] = picked.flatMap((diagnostic) => {
		if (!isCodeDiagnostic(diagnostic)) {
			return [];
		}
		const { sourceLines, ...rest } = diagnostic;
		return [
			{
				...rest,
				filePath: relativePath(rest.filePath),
				...(diagnostic.sourceLines
					? {
							sourceLines: diagnostic.sourceLines.map((entry) => ({
								...entry,
							})),
						}
					: {}),
			},
		];
	});
	const schemaIssues: SchemaDiagnostic[] = [];
	for (const diagnostic of picked) {
		if (!isSchemaDiagnostic(diagnostic)) {
			continue;
		}
		schemaIssues.push({
			...diagnostic,
			filePath: relativePath(diagnostic.filePath),
		});
	}
	return { findings, schemaIssues, summary: buildSummary(picked) };
}

function sliceEndpoints(result: DiagnoseResult): SharedEndpoint[] {
	return (result.endpoints?.endpoints ?? []).map((endpoint) => ({
		controllerClass: endpoint.controllerClass,
		handlerMethod: endpoint.handlerMethod,
		httpMethod: endpoint.httpMethod,
		routePath: endpoint.routePath,
	}));
}

function sliceSchema(
	result: DiagnoseResult,
	relativePath: (filePath: string) => string
): SharedSchema | undefined {
	const schema = result.schema;
	if (!schema?.entities.length) {
		return undefined;
	}
	return {
		entities: schema.entities.map((entity: SerializedSchemaEntity) => ({
			...entity,
			filePath: relativePath(entity.filePath),
		})),
		orm: schema.orm,
		relations: schema.relations,
	};
}

function sliceModules(
	graph: SerializedModuleGraph,
	relativePath: (filePath: string) => string
): SharedModules | undefined {
	if (graph.modules.length === 0) {
		return undefined;
	}
	return {
		bootstrapRoots: graph.bootstrapRoots,
		circularDeps: graph.circularDeps,
		edges: graph.edges,
		modules: graph.modules.map((module) => {
			const { hookTimings, initTimings, ...rest } = module;
			return { ...rest, filePath: relativePath(rest.filePath) };
		}),
		projects: graph.projects,
	};
}

/**
 * The share payload's parts, precomputed. The report page embeds this and
 * assembles downloads by merging slices; it decides nothing about shape.
 */
export function buildShareManifest(
	result: DiagnoseResult,
	options: { graph?: SerializedModuleGraph; targetPath?: string }
): ShareManifest {
	const relativePath = (filePath: string): string =>
		options.targetPath
			? toRelativePath(options.targetPath, filePath)
			: filePath;
	const findingsByCategory: ShareManifest["findingsByCategory"] = {};
	for (const category of FINDINGS_CATEGORIES) {
		const slice = sliceCategory(result, category, relativePath);
		if (slice.summary.total > 0) {
			findingsByCategory[category] = slice;
		}
	}
	const sections = enumerateShareSections(result, options.graph);
	const endpoints = sliceEndpoints(result);
	const schema = sliceSchema(result, relativePath);
	const modules = options.graph
		? sliceModules(options.graph, relativePath)
		: undefined;
	return {
		filename: SHARED_FILENAME,
		findingsByCategory,
		project: result.project,
		sections,
		score: result.score,
		version: SHARED_REPORT_VERSION,
		...(endpoints.length > 0 ? { endpoints } : {}),
		...(schema ? { schema } : {}),
		...(modules ? { modules } : {}),
	};
}

/**
 * Merges manifest slices into the final payload. The only assembly logic
 * in the codebase; the report page mirrors it over precomputed data.
 */
export function mergeShareSlices(
	manifest: ShareManifest,
	options: {
		generator: { name: "nestjs-doctor"; version: string };
		includeCode: boolean;
		sections: string[];
	}
): SharedReport | null {
	const categories = new Set<Category>();
	for (const section of options.sections) {
		if (section.startsWith(FINDINGS_PREFIX)) {
			categories.add(section.slice(FINDINGS_PREFIX.length) as Category);
		}
	}
	const findings: CodeDiagnostic[] = [];
	const schemaIssues: SchemaDiagnostic[] = [];
	const summary = buildSummary([]);
	for (const category of categories) {
		const slice = manifest.findingsByCategory[category];
		if (!slice) {
			continue;
		}
		for (const diagnostic of slice.findings) {
			if (options.includeCode) {
				findings.push(diagnostic);
			} else {
				const { sourceLines, ...rest } = diagnostic;
				findings.push(rest);
			}
		}
		schemaIssues.push(...slice.schemaIssues);
		summary.total += slice.summary.total;
		summary.errors += slice.summary.errors;
		summary.warnings += slice.summary.warnings;
		summary.info += slice.summary.info;
		for (const category of FINDINGS_CATEGORIES) {
			summary.byCategory[category] += slice.summary.byCategory[category];
		}
	}
	const has = (section: string): boolean => options.sections.includes(section);
	if (
		summary.total === 0 &&
		!has(SCORE_SECTION) &&
		!(has(ENDPOINTS_SECTION) && manifest.endpoints) &&
		!(has(SCHEMA_SECTION) && manifest.schema) &&
		!(has(MODULES_SECTION) && manifest.modules)
	) {
		return null;
	}
	return {
		findings,
		generatedAt: new Date().toISOString(),
		generator: options.generator,
		includeCode: options.includeCode && findings.length > 0,
		schemaIssues,
		score: manifest.score,
		sections: options.sections,
		summary,
		version: manifest.version,
		...(has(SCORE_SECTION) ? { project: manifest.project } : {}),
		...(has(ENDPOINTS_SECTION) && manifest.endpoints
			? { endpoints: manifest.endpoints }
			: {}),
		...(has(SCHEMA_SECTION) && manifest.schema
			? { schema: manifest.schema }
			: {}),
		...(has(MODULES_SECTION) && manifest.modules
			? { modules: manifest.modules }
			: {}),
	};
}

/**
 * A shareable slice of a result, built by the same manifest the report page
 * assembles from. The score is carried over untouched: it measures the whole
 * project whatever the shared subset is.
 */
export function buildSharedReport(
	result: DiagnoseResult,
	options: { includeCode: boolean; sections: ShareSectionId[] },
	version: string,
	targetPath?: string,
	graph?: SerializedModuleGraph
): SharedReport | null {
	return mergeShareSlices(buildShareManifest(result, { graph, targetPath }), {
		generator: { name: "nestjs-doctor", version },
		includeCode: options.includeCode,
		sections: options.sections,
	});
}

/** Writes the shared payload beside the scanned project unless named. */
export async function writeSharedReportFile(
	targetPath: string,
	shared: SharedReport,
	outputPath?: string
): Promise<string> {
	const outPath = outputPath ? outputPath : join(targetPath, SHARED_FILENAME);
	await mkdir(dirname(outPath), { recursive: true });
	await writeFile(outPath, `${JSON.stringify(shared, null, 2)}\n`, "utf-8");
	return outPath;
}
