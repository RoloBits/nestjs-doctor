import { performance } from "node:perf_hooks";
import { createAstParser } from "../engine/ast-parser.js";
import { buildModuleGraph } from "../engine/module-graph.js";
import { runRules } from "../engine/rule-runner.js";
import { resolveProviders } from "../engine/type-resolver.js";
import { allRules } from "../rules/index.js";
import { calculateScore } from "../scorer/index.js";
import type { NestjsDoctorConfig } from "../types/config.js";
import type { DiagnoseResult, DiagnoseSummary } from "../types/result.js";
import { loadConfig } from "./config-loader.js";
import { collectFiles } from "./file-collector.js";
import { filterIgnoredDiagnostics } from "./filter-diagnostics.js";
import { detectProject } from "./project-detector.js";

export async function scan(
	targetPath: string,
	options: { config?: string } = {}
): Promise<DiagnoseResult> {
	const startTime = performance.now();

	const config = await loadConfig(targetPath, options.config);
	const project = await detectProject(targetPath);
	const files = await collectFiles(targetPath, config);

	project.fileCount = files.length;

	const astProject = createAstParser(files);
	const moduleGraph = buildModuleGraph(astProject, files);
	const providers = resolveProviders(astProject, files);
	const rules = filterRules(config);
	const rawDiagnostics = runRules(astProject, files, rules, {
		moduleGraph,
		providers,
		config,
	});
	const diagnostics = filterIgnoredDiagnostics(rawDiagnostics, config);

	project.moduleCount = moduleGraph.modules.size;

	const score = calculateScore(diagnostics, files.length);
	const summary = buildSummary(diagnostics);
	const elapsedMs = performance.now() - startTime;

	return { score, diagnostics, project, summary, elapsedMs };
}

function filterRules(config: NestjsDoctorConfig) {
	return allRules.filter((rule) => {
		const ruleConfig = config.rules?.[rule.meta.id];
		if (ruleConfig === false) {
			return false;
		}
		if (typeof ruleConfig === "object" && ruleConfig.enabled === false) {
			return false;
		}

		const categoryEnabled = config.categories?.[rule.meta.category];
		if (categoryEnabled === false) {
			return false;
		}

		return true;
	});
}

function buildSummary(
	diagnostics: DiagnoseResult["diagnostics"]
): DiagnoseSummary {
	return {
		total: diagnostics.length,
		errors: diagnostics.filter((d) => d.severity === "error").length,
		warnings: diagnostics.filter((d) => d.severity === "warning").length,
		info: diagnostics.filter((d) => d.severity === "info").length,
		byCategory: {
			security: diagnostics.filter((d) => d.category === "security").length,
			performance: diagnostics.filter((d) => d.category === "performance")
				.length,
			correctness: diagnostics.filter((d) => d.category === "correctness")
				.length,
			architecture: diagnostics.filter((d) => d.category === "architecture")
				.length,
		},
	};
}
