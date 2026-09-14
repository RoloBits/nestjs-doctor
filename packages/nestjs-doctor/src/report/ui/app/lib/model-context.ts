import type { ReportArtifact } from "../../../../common/artifact.js";
import { decodeCodeGraph } from "../../../../common/code-graph-codec.js";
import { isCodeDiagnostic } from "../../../../common/diagnostic.js";
import { buildEndpoints, relativeTo } from "./descent-walk.js";
import { explainBoots, explainEndpoint } from "./explain.js";

interface ToolResult {
	content: { text: string; type: "text" }[];
}

interface ModelContextTool {
	annotations?: {
		readOnlyHint?: boolean;
		untrustedContentHint?: boolean;
	};
	description: string;
	execute: (input: Record<string, unknown>) => Promise<ToolResult>;
	inputSchema?: Record<string, unknown>;
	name: string;
}

interface ModelContext {
	registerTool: (
		tool: ModelContextTool,
		options?: { signal?: AbortSignal }
	) => unknown;
}

const ANNOTATIONS = { readOnlyHint: true, untrustedContentHint: true };
const MAX_FINDINGS = 50;

/** The page's model context, on the document or the navigator, when the browser has one. */
function modelContextOf(): ModelContext | undefined {
	if (typeof document === "undefined" || typeof navigator === "undefined") {
		return undefined;
	}
	const doc = (document as { modelContext?: ModelContext }).modelContext;
	const nav = (navigator as { modelContext?: ModelContext }).modelContext;
	const mc = doc ?? nav;
	return typeof mc?.registerTool === "function" ? mc : undefined;
}

function text(value: string): ToolResult {
	return { content: [{ text: value, type: "text" }] };
}

function summaryText(report: ReportArtifact): string {
	const { summary } = report;
	const by = Object.entries(summary.byCategory)
		.map(([category, count]) => `${category} ${count}`)
		.join(" · ");
	const lines = [
		`score ${report.score.value}/100 (${report.score.label})`,
		`${summary.total} findings: ${summary.errors} errors · ${summary.warnings} warnings · ${summary.info} info`,
		`by category: ${by}`,
		`project: ${report.project.name} · ${report.project.fileCount} files · ${report.project.moduleCount} modules`,
		`routes: ${report.endpoints.endpoints.length} · boot traces: ${explainBoots(report.graph, { version: "" }).length}`,
	];
	if (report.scope) {
		lines.push(`scope: ${report.scope.mode}`);
	}
	return lines.join("\n");
}

function findingsText(
	report: ReportArtifact,
	input: Record<string, unknown>
): string {
	const limit = Math.min(Number(input.limit) || MAX_FINDINGS, MAX_FINDINGS);
	const wanted = (key: string, value: string): boolean =>
		typeof input[key] !== "string" || input[key] === value;
	const file = typeof input.file === "string" ? input.file : undefined;
	const rows = report.diagnostics.filter(
		(d) =>
			wanted("severity", d.severity) &&
			wanted("category", d.category) &&
			wanted("rule", d.rule) &&
			(!file || relativeTo(report.root, d.filePath).includes(file))
	);
	const lines = rows.slice(0, limit).map((d) => {
		const where = isCodeDiagnostic(d)
			? `${relativeTo(report.root, d.filePath)}:${d.line}`
			: `${relativeTo(report.root, d.filePath)} (entity ${d.entity})`;
		return `${d.severity}  ${d.rule}  ${where}  ${d.message}`;
	});
	if (rows.length > limit) {
		lines.push(`… and ${rows.length - limit} more`);
	}
	return lines.length > 0 ? lines.join("\n") : "no findings match";
}

function endpointText(
	report: ReportArtifact,
	input: Record<string, unknown>
): string {
	if (!report.codeGraph) {
		return "this report carries no code graph, so no route can be explained";
	}
	const method = String(input.method ?? "GET").toUpperCase();
	const path = String(input.path ?? "");
	const endpoint = buildEndpoints(decodeCodeGraph(report.codeGraph)).find(
		(e) => e.httpMethod === method && e.routePath === path
	);
	if (!endpoint) {
		return `no route ${method} ${path} in this report`;
	}
	return explainEndpoint(endpoint, {
		root: report.root,
		sources: report.sources,
		version: report.generator.version,
	});
}

function bootText(
	report: ReportArtifact,
	input: Record<string, unknown>
): string {
	const boots = explainBoots(report.graph, {
		version: report.generator.version,
	});
	if (boots.length === 0) {
		return "this report carries no boot trace";
	}
	const label = typeof input.label === "string" ? input.label : undefined;
	const picked = label ? boots.filter((b) => b.label === label) : boots;
	if (picked.length === 0) {
		return `no boot trace labelled ${label}; traces: ${boots.map((b) => b.label).join(", ")}`;
	}
	return picked.map((b) => b.explain).join("\n");
}

/**
 * Registers the report's read-only tools with the browser's model context,
 * when it has one. Returns the function that unregisters them.
 */
export function registerModelContext(report: ReportArtifact): () => void {
	const mc = modelContextOf();
	if (!mc) {
		return () => undefined;
	}
	const controller = new AbortController();
	const tools: ModelContextTool[] = [
		{
			annotations: ANNOTATIONS,
			description:
				"The nestjs-doctor report's health score, finding counts by severity and category, and project size.",
			execute: () => Promise.resolve(text(summaryText(report))),
			inputSchema: { properties: {}, type: "object" },
			name: "get_summary",
		},
		{
			annotations: ANNOTATIONS,
			description:
				"Findings of the scan, one per line: severity, rule id, file and line, message. Filter by severity, category, rule id or a file path fragment.",
			execute: (input) => Promise.resolve(text(findingsText(report, input))),
			inputSchema: {
				properties: {
					category: {
						enum: [
							"security",
							"correctness",
							"architecture",
							"performance",
							"schema",
						],
						type: "string",
					},
					file: { type: "string" },
					limit: { maximum: MAX_FINDINGS, minimum: 1, type: "integer" },
					rule: { type: "string" },
					severity: { enum: ["error", "warning", "info"], type: "string" },
				},
				type: "object",
			},
			name: "list_findings",
		},
		{
			annotations: ANNOTATIONS,
			description:
				"One route's walk as plain text: the database verdict, the steps in source order with their call sites, the conditions above them, and the source lines of the first read and write.",
			execute: (input) => Promise.resolve(text(endpointText(report, input))),
			inputSchema: {
				properties: {
					method: { type: "string" },
					path: { type: "string" },
				},
				required: ["path"],
				type: "object",
			},
			name: "explain_endpoint",
		},
		{
			annotations: ANNOTATIONS,
			description:
				"A captured boot as plain text: phases, the last class built, the slowest modules, classes and hooks. Pass a label to pick one trace of a monorepo.",
			execute: (input) => Promise.resolve(text(bootText(report, input))),
			inputSchema: {
				properties: { label: { type: "string" } },
				type: "object",
			},
			name: "explain_boot_trace",
		},
	];
	for (const tool of tools) {
		mc.registerTool(tool, { signal: controller.signal });
	}
	return () => controller.abort();
}
