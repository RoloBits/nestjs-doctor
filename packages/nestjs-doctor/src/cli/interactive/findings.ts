import {
	type Diagnostic,
	isCodeDiagnostic,
	onSurface,
	type Severity,
} from "../../common/diagnostic.js";

export interface RuleGroup {
	diagnostics: Diagnostic[];
	rule: string;
	scored: boolean;
	severity: Severity;
}

const SEVERITY_RANK: Record<Severity, number> = {
	error: 0,
	warning: 1,
	info: 2,
};

/**
 * Groups by rule: scored rules first, then worst severity, then by how often
 * the rule fired.
 */
export const groupFindings = (diagnostics: Diagnostic[]): RuleGroup[] => {
	const groups = new Map<string, RuleGroup>();
	for (const diagnostic of diagnostics) {
		const group = groups.get(diagnostic.rule);
		if (group) {
			group.diagnostics.push(diagnostic);
		} else {
			groups.set(diagnostic.rule, {
				diagnostics: [diagnostic],
				rule: diagnostic.rule,
				scored: onSurface(diagnostic, "score"),
				severity: diagnostic.severity,
			});
		}
	}
	return [...groups.values()].sort(
		(a, b) =>
			Number(b.scored) - Number(a.scored) ||
			SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
			b.diagnostics.length - a.diagnostics.length ||
			a.rule.localeCompare(b.rule)
	);
};

export const locate = (diagnostic: Diagnostic): string => {
	if (isCodeDiagnostic(diagnostic)) {
		return `${diagnostic.filePath}:${diagnostic.line}:${diagnostic.column}`;
	}
	return `entity ${diagnostic.entity}`;
};

export const docsUrl = (rule: string): string | undefined => {
	const [category] = rule.split("/");
	if (rule.startsWith("custom/")) {
		return;
	}
	return `https://nestjs.doctor/docs/rules/${category}`;
};

/** One agent-ready prompt for a single rule's findings. */
export const buildFixPrompt = (
	group: RuleGroup,
	targetPath: string
): string => {
	const first = group.diagnostics[0];
	const locations = group.diagnostics
		.slice(0, 10)
		.map((diagnostic) => `- ${locate(diagnostic)}`)
		.join("\n");
	const overflow =
		group.diagnostics.length > 10
			? `\n…and ${group.diagnostics.length - 10} more; run npx nestjs-doctor@latest . --json for the full list.`
			: "";

	return [
		`Fix the ${group.rule} findings reported by nestjs-doctor in ${targetPath}.`,
		"",
		`Finding: ${first.message}`,
		`Fix guidance: ${first.help}`,
		"",
		`Locations (${group.diagnostics.length}):`,
		`${locations}${overflow}`,
		"",
		"Fix the root cause; do not suppress the rule or delete the check.",
		"Verify by re-running: npx nestjs-doctor@latest .",
	].join("\n");
};
