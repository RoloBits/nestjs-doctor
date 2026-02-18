import type { ProjectRule } from "../types.js";

const MAX_DIRECT_PROVIDERS = 5;

export const requireFeatureModules: ProjectRule = {
	meta: {
		id: "architecture/require-feature-modules",
		category: "architecture",
		severity: "warning",
		description:
			"AppModule should import feature modules rather than declaring many providers directly",
		help: "Group related providers into feature modules and import them in AppModule.",
		scope: "project",
	},

	check(context) {
		const appModule = context.moduleGraph.modules.get("AppModule");
		if (!appModule) {
			return;
		}

		if (
			appModule.providers.length > MAX_DIRECT_PROVIDERS &&
			appModule.imports.length < appModule.providers.length
		) {
			context.report({
				filePath: appModule.filePath,
				message: `AppModule declares ${appModule.providers.length} providers directly. Group them into feature modules.`,
				help: this.meta.help,
				line: appModule.classDeclaration.getStartLineNumber(),
				column: 1,
			});
		}
	},
};
