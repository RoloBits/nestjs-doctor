import { createAstParser } from "../engine/ast-parser.js";
import { runRules } from "../engine/rule-runner.js";
import { allRules } from "../rules/index.js";
import { calculateScore } from "../scorer/index.js";
import type { NestjsDoctorConfig } from "../types/config.js";
import type { DiagnoseResult, DiagnoseSummary } from "../types/result.js";
import { loadConfig } from "./config-loader.js";
import { collectFiles } from "./file-collector.js";
import { detectProject } from "./project-detector.js";

export async function scan(
	targetPath: string,
	options: { config?: string } = {},
): Promise<DiagnoseResult> {
	const config = await loadConfig(targetPath, options.config);
	const project = await detectProject(targetPath);
	const files = await collectFiles(targetPath, config);

	project.fileCount = files.length;

	const astProject = createAstParser(files);
	const rules = filterRules(config);
	const diagnostics = runRules(astProject, files, rules);

	project.moduleCount = countModules(astProject, files);

	const score = calculateScore(diagnostics, files.length);
	const summary = buildSummary(diagnostics);

	return { score, diagnostics, project, summary };
}

function filterRules(config: NestjsDoctorConfig) {
	return allRules.filter((rule) => {
		const ruleConfig = config.rules?.[rule.meta.id];
		if (ruleConfig === false) return false;
		if (typeof ruleConfig === "object" && ruleConfig.enabled === false)
			return false;

		const categoryEnabled = config.categories?.[rule.meta.category];
		if (categoryEnabled === false) return false;

		return true;
	});
}

function countModules(
	astProject: ReturnType<typeof createAstParser>,
	files: string[],
): number {
	let count = 0;
	for (const filePath of files) {
		const sourceFile = astProject.getSourceFile(filePath);
		if (!sourceFile) continue;
		for (const cls of sourceFile.getClasses()) {
			const moduleDecorator = cls.getDecorator("Module");
			if (moduleDecorator) count++;
		}
	}
	return count;
}

function buildSummary(
	diagnostics: DiagnoseResult["diagnostics"],
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
