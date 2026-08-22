import type { Advisory } from "../../../advisories/data.js";
import {
	type AdvisoryMatch,
	matchAdvisories,
	packageJsonPath,
} from "../../../advisories/match.js";
import type { ProjectRule, ProjectRuleContext } from "../../types.js";

const SEVERE = new Set<Advisory["severity"]>(["critical", "high"]);
const REST = new Set<Advisory["severity"]>(["moderate", "low"]);

const describe = ({ advisory, installed }: AdvisoryMatch) =>
	`${advisory.packageName}@${installed} is affected by ${advisory.cve} (${advisory.severity}): ${advisory.summary}. Patched in ${advisory.patched}.`;

const reportAll = (
	context: ProjectRuleContext,
	severities: ReadonlySet<Advisory["severity"]>
) => {
	const filePath = packageJsonPath(context.targetPath);
	for (const match of matchAdvisories(context.dependencies, severities)) {
		context.report({
			filePath,
			line: 1,
			column: 1,
			message: describe(match),
			help: `Upgrade to ${match.advisory.packageName}@${match.advisory.patched} or newer. See ${match.advisory.url}`,
		});
	}
};

/**
 * Split in two because a rule carries one severity for every diagnostic it
 * emits, and a critical sandbox escape does not deserve the same weight as a
 * moderate disclosure.
 */
export const noVulnerableNestjsPackages: ProjectRule = {
	meta: {
		id: "security/no-vulnerable-nestjs-packages",
		category: "security",
		severity: "error",
		scope: "project",
		description:
			"Official @nestjs/* packages should not be on a version with a critical or high advisory",
		help: "Upgrade to the patched version named in the finding. The advisory list ships with the CLI, so a scan makes no network call and an older CLI knows about fewer advisories.",
	},
	check: (context) => reportAll(context, SEVERE),
};

export const nestjsPackageAdvisory: ProjectRule = {
	meta: {
		id: "security/nestjs-package-advisory",
		category: "security",
		severity: "warning",
		scope: "project",
		description:
			"Official @nestjs/* packages should not be on a version with a published advisory",
		help: "Upgrade to the patched version named in the finding. Where the only patched release is in a later major, treat it as a planned upgrade rather than a hotfix.",
	},
	check: (context) => reportAll(context, REST),
};
