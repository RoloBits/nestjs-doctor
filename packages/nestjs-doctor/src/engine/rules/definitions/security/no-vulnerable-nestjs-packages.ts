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
	const id = advisory.cve ?? advisory.ghsa;
	return `${found} is affected by ${id} (${advisory.severity}): ${advisory.summary}. Patched in ${advisory.patched}.`;
};

const reportAll = (
	context: ProjectRuleContext,
	severities: ReadonlySet<Advisory["severity"]>,
	reportUnchecked = false
) => {
	const manifest = findManifest(context.targetPath);

	// No manifest and an unparseable one both mean nothing was checked, which
	// otherwise reads exactly like a project with no advisories.
	if (!manifest) {
		if (reportUnchecked) {
			context.report({
				filePath: `${context.targetPath}/package.json`,
				line: 1,
				column: 1,
				message:
					"Found no package.json at or above the scanned path, so no dependency was checked against the advisory list.",
				help: "Scan a directory that has a package.json, or point --config at the project root.",
			});
		}
		return;
	}

	if (manifest.unreadable) {
		if (reportUnchecked) {
			context.report({
				filePath: manifest.path,
				line: 1,
				column: 1,
				message:
					"Could not parse package.json, so no dependency was checked against the advisory list.",
				help: "Fix the JSON. A trailing comma or a comment makes the whole file unreadable.",
			});
		}
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
