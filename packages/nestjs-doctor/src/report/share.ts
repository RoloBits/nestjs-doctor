import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { SerializedModuleGraph } from "../common/artifact.js";
import {
	type Category,
	type CodeDiagnostic,
	forSurface,
	isCodeDiagnostic,
	isSchemaDiagnostic,
	type SchemaDiagnostic,
} from "../common/diagnostic.js";
import type {
	DiagnoseResult,
	DiagnoseSummary,
	Score,
} from "../common/result.js";
import type {
	SchemaRelation,
	SerializedSchemaEntity,
} from "../common/schema.js";
import { toRelativePath } from "../engine/fingerprint.js";
import { buildSummary } from "../engine/result-builder.js";

export const SHARED_REPORT_VERSION = 1;

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

export interface ShareSection {
	count: number;
	id: ShareSectionId;
	label: string;
}

/**
 * The sections a result can offer, derived from its content so both the
 * terminal picker and report's share dialog show only what exists.
 */
export function enumerateShareSections(result: DiagnoseResult): ShareSection[] {
	const sections: ShareSection[] = [
		{
			id: SCORE_SECTION,
			count: result.score.value,
			label: "Health score and project info",
		},
	];
	for (const category of FINDINGS_CATEGORIES) {
		const count = result.diagnostics.filter(
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
	if (result.project.moduleCount > 0) {
		sections.push({
			id: MODULES_SECTION,
			count: result.project.moduleCount,
			label: "Module graph",
		});
	}
	return sections;
}

interface SharedEndpoint {
	controllerClass: string;
	handlerMethod: string;
	httpMethod: string;
	routePath: string;
}

/** The module graph as a share exports it: no timings, relative paths. */
interface SharedModuleGraph {
	bootstrapRoots?: string[];
	circularDeps: string[][];
	edges: SerializedModuleGraph["edges"];
	modules: Array<
		Omit<
			SerializedModuleGraph["modules"][number],
			"hookTimings" | "initTimings" | "filePath"
		> & { filePath: string }
	>;
	projects: string[];
}

interface SharedReport {
	endpoints?: SharedEndpoint[];
	findings: CodeDiagnostic[];
	generatedAt: string;
	generator: { name: "nestjs-doctor"; version: string };
	includeCode: boolean;
	modules?: SharedModuleGraph;
	/** Present only when the score section is shared. */
	project?: DiagnoseResult["project"];
	schema?: {
		entities: Array<
			Omit<SerializedSchemaEntity, "filePath"> & { filePath: string }
		>;
		orm: string;
		relations: SchemaRelation[];
	};
	schemaIssues: SchemaDiagnostic[];
	score: Score;
	sections: ShareSectionId[];
	summary: DiagnoseSummary;
	version: number;
}

/**
 * A shareable slice of a result. The score is carried over untouched: it
 * measures the whole project whatever the shared subset is. Only the cli
 * surface's diagnostics are eligible, and finding paths are stored relative
 * to the scanned directory.
 */
export function buildSharedReport(
	result: DiagnoseResult,
	options: { includeCode: boolean; sections: ShareSectionId[] },
	version: string,
	targetPath?: string,
	graph?: SerializedModuleGraph
): SharedReport | null {
	const categories = new Set<Category>();
	for (const section of options.sections) {
		if (section.startsWith(FINDINGS_PREFIX)) {
			categories.add(section.slice(FINDINGS_PREFIX.length) as Category);
		}
	}
	const picked = forSurface(result.diagnostics, "cli").filter((diagnostic) =>
		categories.has(diagnostic.category)
	);
	const relativePath = (filePath: string): string =>
		targetPath ? toRelativePath(targetPath, filePath) : filePath;

	const findings: CodeDiagnostic[] = picked.flatMap((diagnostic) => {
		if (!isCodeDiagnostic(diagnostic)) {
			return [];
		}
		const { sourceLines, ...rest } = diagnostic;
		return [
			{
				...rest,
				filePath: relativePath(rest.filePath),
				...(options.includeCode && diagnostic.sourceLines
					? {
							sourceLines: diagnostic.sourceLines.map((entry) => ({
								...entry,
							})),
						}
					: {}),
			},
		];
	});
	const schemaIssues = picked.flatMap((diagnostic) =>
		isSchemaDiagnostic(diagnostic) ? [diagnostic] : []
	);
	const endpoints = options.sections.includes(ENDPOINTS_SECTION)
		? (result.endpoints?.endpoints ?? []).map((endpoint) => ({
				controllerClass: endpoint.controllerClass,
				handlerMethod: endpoint.handlerMethod,
				httpMethod: endpoint.httpMethod,
				routePath: endpoint.routePath,
			}))
		: undefined;
	const schemaGraph = result.schema;
	const schema =
		options.sections.includes(SCHEMA_SECTION) && schemaGraph?.entities.length
			? {
					entities: schemaGraph.entities.map((entity) => ({
						...entity,
						filePath: relativePath(entity.filePath),
					})),
					orm: schemaGraph.orm,
					relations: schemaGraph.relations,
				}
			: undefined;
	const modules =
		options.sections.includes(MODULES_SECTION) && graph
			? {
					bootstrapRoots: graph.bootstrapRoots,
					circularDeps: graph.circularDeps,
					edges: graph.edges,
					modules: graph.modules.map((module) => {
						const { hookTimings, initTimings, ...rest } = module;
						return { ...rest, filePath: relativePath(rest.filePath) };
					}),
					projects: graph.projects,
				}
			: undefined;
	const summary = buildSummary(picked);
	if (
		!summary.total &&
		(endpoints?.length ?? 0) === 0 &&
		!schema &&
		!modules &&
		!options.sections.includes(SCORE_SECTION)
	) {
		return null;
	}

	return {
		findings,
		generatedAt: new Date().toISOString(),
		generator: { name: "nestjs-doctor", version },
		includeCode: options.includeCode && findings.length > 0,
		schemaIssues,
		score: result.score,
		sections: options.sections,
		summary,
		version: SHARED_REPORT_VERSION,
		...(options.sections.includes(SCORE_SECTION)
			? { project: result.project }
			: {}),
		...(endpoints ? { endpoints } : {}),
		...(schema ? { schema } : {}),
		...(modules ? { modules } : {}),
	};
}

/** Writes the shared payload beside the scanned project unless named. */
export async function writeSharedReportFile(
	targetPath: string,
	shared: SharedReport,
	outputPath?: string
): Promise<string> {
	const outPath = outputPath
		? outputPath
		: join(targetPath, "nestjs-doctor-shared.json");
	await mkdir(dirname(outPath), { recursive: true });
	await writeFile(outPath, `${JSON.stringify(shared, null, 2)}\n`, "utf-8");
	return outPath;
}
