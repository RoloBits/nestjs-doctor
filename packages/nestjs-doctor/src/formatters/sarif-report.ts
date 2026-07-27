import { pathToFileURL } from "node:url";
import type { Diagnostic, Severity } from "../common/diagnostic.js";
import { isCodeDiagnostic } from "../common/diagnostic.js";
import type { DiagnoseResult } from "../common/result.js";
import { fingerprint, toRelativePath } from "../engine/fingerprint.js";
import { getRules } from "../engine/rules/index.js";

const SARIF_VERSION = "2.1.0";
const SARIF_SCHEMA = "https://json.schemastore.org/sarif-2.1.0.json";
const DOCS_BASE_URL = "https://nestjs.doctor/docs/rules";
const SRCROOT = "%SRCROOT%";

type SarifLevel = "error" | "warning" | "note";

const LEVEL_BY_SEVERITY: Record<Severity, SarifLevel> = {
	error: "error",
	warning: "warning",
	info: "note",
};

// SARIF's `problem.severity` drives the alert grouping GitHub shows.
const PROBLEM_SEVERITY: Record<Severity, string> = {
	error: "error",
	warning: "warning",
	info: "recommendation",
};

interface SarifRule {
	fullDescription: { text: string };
	help: { markdown: string; text: string };
	helpUri: string;
	id: string;
	name: string;
	properties: {
		problem: { severity: string };
		tags: string[];
	};
	shortDescription: { text: string };
}

interface SarifResult {
	level: SarifLevel;
	locations: {
		physicalLocation: {
			artifactLocation: { uri: string; uriBaseId: string };
			region: { startColumn?: number; startLine: number };
		};
	}[];
	message: { text: string };
	partialFingerprints: Record<string, string>;
	ruleId: string;
	ruleIndex: number;
}

export interface SarifLog {
	$schema: string;
	runs: {
		columnKind: string;
		originalUriBaseIds: Record<string, { uri: string }>;
		results: SarifResult[];
		tool: {
			driver: {
				informationUri: string;
				name: string;
				rules: SarifRule[];
				semanticVersion: string;
				version: string;
			};
		};
	}[];
	version: string;
}

const ruleCategory = (ruleId: string): string => {
	const slash = ruleId.indexOf("/");
	return slash === -1 ? "correctness" : ruleId.slice(0, slash);
};

const helpUri = (ruleId: string): string =>
	`${DOCS_BASE_URL}/${ruleCategory(ruleId)}`;

/**
 * Builds the rule catalogue, synthesising an entry for any rule a diagnostic
 * references that `getRules()` does not return.
 */
function buildRuleCatalogue(diagnostics: Diagnostic[]): {
	indexById: Map<string, number>;
	rules: SarifRule[];
} {
	const rules: SarifRule[] = [];
	const indexById = new Map<string, number>();

	const push = (
		id: string,
		description: string,
		help: string,
		severity: Severity
	): void => {
		if (indexById.has(id)) {
			return;
		}
		indexById.set(id, rules.length);
		rules.push({
			id,
			name: id,
			shortDescription: { text: description },
			fullDescription: { text: description },
			help: { text: help, markdown: help },
			helpUri: helpUri(id),
			properties: {
				tags: ["nestjs", ruleCategory(id)],
				problem: { severity: PROBLEM_SEVERITY[severity] },
			},
		});
	};

	for (const rule of getRules()) {
		push(
			rule.meta.id,
			rule.meta.description,
			rule.meta.help,
			rule.meta.severity
		);
	}
	for (const diagnostic of diagnostics) {
		push(
			diagnostic.rule,
			diagnostic.message,
			diagnostic.help,
			diagnostic.severity
		);
	}

	return { rules, indexById };
}

/**
 * Renders a result as a SARIF 2.1.0 log, with an explicit `partialFingerprints`
 * on every result.
 */
export function buildSarifLog(
	result: DiagnoseResult,
	targetPath: string,
	version: string
): SarifLog {
	const { rules, indexById } = buildRuleCatalogue(result.diagnostics);

	const results: SarifResult[] = result.diagnostics.map((diagnostic) => {
		const isCode = isCodeDiagnostic(diagnostic);
		return {
			ruleId: diagnostic.rule,
			ruleIndex: indexById.get(diagnostic.rule) ?? 0,
			level: LEVEL_BY_SEVERITY[diagnostic.severity],
			message: { text: `${diagnostic.message} ${diagnostic.help}`.trim() },
			locations: [
				{
					physicalLocation: {
						artifactLocation: {
							uri: toRelativePath(targetPath, diagnostic.filePath),
							uriBaseId: SRCROOT,
						},
						// Schema findings describe an entity rather than a span, so they
						// anchor at the top of the file that declares it.
						region: isCode
							? {
									startLine: Math.max(1, diagnostic.line),
									startColumn: Math.max(1, diagnostic.column),
								}
							: { startLine: 1 },
					},
				},
			],
			partialFingerprints: {
				"nestjsDoctor/v1": fingerprint(diagnostic, targetPath),
			},
		};
	});

	return {
		$schema: SARIF_SCHEMA,
		version: SARIF_VERSION,
		runs: [
			{
				tool: {
					driver: {
						name: "nestjs-doctor",
						informationUri: "https://nestjs.doctor",
						version,
						semanticVersion: version,
						rules,
					},
				},
				originalUriBaseIds: {
					[SRCROOT]: { uri: pathToFileURL(`${targetPath}/`).href },
				},
				results,
				columnKind: "utf16CodeUnits",
			},
		],
	};
}
