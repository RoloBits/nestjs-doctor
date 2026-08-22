import type { Advisory } from "../../../advisories/data.js";
import { dependencyLine } from "../../../advisories/installed.js";
import { findManifest } from "../../../advisories/manifest.js";
import {
	type AdvisoryMatch,
	matchAdvisories,
} from "../../../advisories/match.js";
import type { ProjectRule, ProjectRuleContext } from "../../types.js";

const SEVERE = new Set<Advisory["severity"]>(["critical", "high"]);
const REST = new Set<Advisory["severity"]>(["moderate", "low"]);

const EXACT_SPEC = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

const describe = ({
	advisory,
	declaration,
	installed,
}: AdvisoryMatch): string => {
	const spec = declaration.spec;
	let found: string;
	if (installed) {
		found = `${advisory.packageName}@${installed}`;
	} else if (EXACT_SPEC.test(spec.trim())) {
		found = `${advisory.packageName}@${spec.trim()}`;
	} else {
		found = `${advisory.packageName} at ${spec}, a range with no patched version in it,`;
	}
	return `${found} is affected by ${advisory.cve} (${advisory.severity}): ${advisory.summary}. Patched in ${advisory.patched}.`;
};

const reportAll = (
	context: ProjectRuleContext,
	severities: ReadonlySet<Advisory["severity"]>,
	reportUnchecked = false
) => {
	const manifest = findManifest(context.targetPath);
	if (!manifest) {
		return;
	}
	const { matches, unchecked } = matchAdvisories(manifest, severities);
	if (reportUnchecked && unchecked.length > 0) {
		context.report({
			filePath: manifest.path,
			line: 1,
			column: 1,
			message: `Could not establish the installed version of ${unchecked.join(", ")}, so no advisory was checked against ${unchecked.length === 1 ? "it" : "them"}.`,
			help: "Install dependencies before scanning, or pin the version so the range names one.",
		});
	}
	for (const match of matches) {
		context.report({
			filePath: manifest.path,
			line: dependencyLine(
				manifest.path,
				match.declaration.block,
				match.advisory.packageName
			),
			column: 1,
			message: describe(match),
			help: `Upgrade to ${match.advisory.packageName}@${match.advisory.patched} or newer. See ${match.advisory.url}`,
		});
	}
};

export const noVulnerableNestjsPackages: ProjectRule = {
	meta: {
		id: "security/no-vulnerable-nestjs-packages",
		category: "security",
		severity: "error",
		scope: "project",
		description:
			"Official @nestjs/* packages should not be on a version with a critical or high advisory",
		help: "Upgrade to the patched version named in the finding. Silence it with `ignore.rules`; package.json takes no inline comment.",
	},
	check: (context) => reportAll(context, SEVERE),
};

export const noAdvisoryNestjsPackages: ProjectRule = {
	meta: {
		id: "security/no-advisory-nestjs-packages",
		category: "security",
		severity: "warning",
		surfaces: ["cli", "prComment"],
		scope: "project",
		description:
			"Official @nestjs/* packages should not be on a version with a published advisory",
		help: "Upgrade to the patched version named in the finding. Where the only fix is in a later major, treat it as a planned upgrade.",
	},
	check: (context) => reportAll(context, REST, true),
};
