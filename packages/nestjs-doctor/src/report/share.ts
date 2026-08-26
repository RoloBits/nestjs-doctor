import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
	type Category,
	type CodeDiagnostic,
	isCodeDiagnostic,
	isSchemaDiagnostic,
	type SchemaDiagnostic,
} from "../common/diagnostic.js";
import type {
	DiagnoseResult,
	DiagnoseSummary,
	Score,
} from "../common/result.js";
import { buildSummary } from "../engine/result-builder.js";

export const SHARED_REPORT_VERSION = 1;

const FINDINGS_PREFIX = "findings:";
export const SCORE_SECTION = "score";
export const ENDPOINTS_SECTION = "endpoints";
const FINDINGS_CATEGORIES: Category[] = [
	"security",
	"performance",
	"correctness",
	"architecture",
	"schema",
];

export type ShareSectionId =
	| "score"
	| "endpoints"
	| `${typeof FINDINGS_PREFIX}${Category}`;

/** Parses a `--share-sections` value; the string is what failed validation. */
export function parseShareSections(
	csv: string
): { sections: ShareSectionId[]; error?: undefined } | { error: string } {
	const valid = new Set<string>([SCORE_SECTION, ENDPOINTS_SECTION]);
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
	return sections;
}

interface SharedEndpoint {
	controllerClass: string;
	handlerMethod: string;
	httpMethod: string;
	routePath: string;
}

interface SharedReport {
	endpoints?: SharedEndpoint[];
	findings: CodeDiagnostic[];
	generatedAt: string;
	generator: { name: "nestjs-doctor"; version: string };
	includeCode: boolean;
	project: DiagnoseResult["project"];
	schemaIssues: SchemaDiagnostic[];
	score: Score;
	sections: ShareSectionId[];
	summary: DiagnoseSummary;
	version: number;
}

/**
 * A shareable slice of a result. The score is carried over untouched: it
 * measures the whole project whatever the shared subset is.
 */
export function buildSharedReport(
	result: DiagnoseResult,
	options: { includeCode: boolean; sections: ShareSectionId[] },
	version: string
): SharedReport | null {
	const categories = new Set<Category>();
	for (const section of options.sections) {
		if (section.startsWith(FINDINGS_PREFIX)) {
			categories.add(section.slice(FINDINGS_PREFIX.length) as Category);
		}
	}
	const picked = result.diagnostics.filter((diagnostic) =>
		categories.has(diagnostic.category)
	);

	const findings: CodeDiagnostic[] = picked.flatMap((diagnostic) => {
		if (!isCodeDiagnostic(diagnostic)) {
			return [];
		}
		if (options.includeCode && diagnostic.sourceLines) {
			return [{ ...diagnostic }];
		}
		const { sourceLines, ...rest } = diagnostic;
		return [rest as CodeDiagnostic];
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
	const summary = buildSummary(picked);
	if (
		!summary.total &&
		(endpoints?.length ?? 0) === 0 &&
		!options.sections.includes(SCORE_SECTION)
	) {
		return null;
	}

	return {
		findings,
		generatedAt: new Date().toISOString(),
		generator: { name: "nestjs-doctor", version },
		includeCode: options.includeCode && findings.length > 0,
		project: result.project,
		schemaIssues,
		score: result.score,
		sections: options.sections,
		summary,
		version: SHARED_REPORT_VERSION,
		...(endpoints ? { endpoints } : {}),
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
