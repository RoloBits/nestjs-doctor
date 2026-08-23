import { isCancel, log, select } from "@clack/prompts";
import {
	type Diagnostic,
	isCodeDiagnostic,
	type Severity,
} from "../../common/diagnostic.js";
import { highlighter } from "../ui/highlighter.js";
import { copyToClipboard } from "./clipboard.js";
import { renderCodeFrame } from "./code-frame.js";
import { ruleInfo } from "./rule-info.js";
import { renderRulePanel } from "./rule-panel.js";

interface RuleGroup {
	diagnostics: Diagnostic[];
	rule: string;
	severity: Severity;
}

const SEVERITY_RANK: Record<Severity, number> = {
	error: 0,
	warning: 1,
	info: 2,
};

const SEVERITY_MARK: Record<Severity, string> = {
	error: highlighter.error("x"),
	warning: highlighter.warn("!"),
	info: highlighter.info("i"),
};

/** Groups by rule, worst severity first, then by how often the rule fired. */
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
				severity: diagnostic.severity,
			});
		}
	}
	return [...groups.values()].sort(
		(a, b) =>
			SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
			b.diagnostics.length - a.diagnostics.length ||
			a.rule.localeCompare(b.rule)
	);
};

const locate = (diagnostic: Diagnostic): string => {
	if (isCodeDiagnostic(diagnostic)) {
		return `${diagnostic.filePath}:${diagnostic.line}:${diagnostic.column}`;
	}
	return `entity ${diagnostic.entity}`;
};

const docsUrl = (rule: string): string | undefined => {
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

const printDetail = (
	diagnostic: Diagnostic,
	group: RuleGroup,
	position: number
): void => {
	const header = `${SEVERITY_MARK[diagnostic.severity]} ${diagnostic.rule} ${highlighter.dim(
		`(${position + 1}/${group.diagnostics.length})`
	)}`;
	const lines = [
		header,
		highlighter.dim(`${diagnostic.category} · ${locate(diagnostic)}`),
		"",
		diagnostic.message,
	];

	if (isCodeDiagnostic(diagnostic) && diagnostic.sourceLines?.length) {
		lines.push(
			"",
			renderCodeFrame(
				diagnostic.sourceLines,
				diagnostic.line,
				diagnostic.column
			)
		);
	}

	lines.push("", `Fix: ${diagnostic.help}`);
	lines.push(
		...renderRulePanel(ruleInfo(diagnostic.rule), docsUrl(diagnostic.rule))
	);

	process.stdout.write(`\n${lines.join("\n")}\n\n`);
};

type DetailAction = "next" | "previous" | "copy" | "back";

const reviewGroup = async (
	group: RuleGroup,
	targetPath: string
): Promise<"back" | "cancel"> => {
	let position = 0;
	for (;;) {
		const diagnostic = group.diagnostics[position];
		printDetail(diagnostic, group, position);

		const options: { label: string; value: DetailAction }[] = [];
		if (position < group.diagnostics.length - 1) {
			options.push({ label: "Next finding", value: "next" });
		}
		if (position > 0) {
			options.push({ label: "Previous finding", value: "previous" });
		}
		options.push(
			{ label: "Copy a fix prompt for this rule", value: "copy" },
			{ label: "Back to the rule list", value: "back" }
		);

		const choice = await select<DetailAction>({
			message: group.rule,
			options,
		});

		if (isCancel(choice)) {
			return "cancel";
		}
		if (choice === "back") {
			return "back";
		}
		if (choice === "next") {
			position += 1;
		} else if (choice === "previous") {
			position -= 1;
		} else if (choice === "copy") {
			const prompt = buildFixPrompt(group, targetPath);
			if (await copyToClipboard(prompt)) {
				log.success("Fix prompt copied. Paste it into any agent.");
			} else {
				log.warn("No clipboard tool found; printing instead.");
				process.stdout.write(`\n${prompt}\n\n`);
			}
		}
	}
};

/** The finding browser: rule groups, then finding-by-finding detail. */
export const reviewFindings = async (
	diagnostics: Diagnostic[],
	targetPath: string
): Promise<void> => {
	const groups = groupFindings(diagnostics);

	for (;;) {
		const choice = await select<RuleGroup | "back">({
			message: "Which rule?",
			options: [
				...groups.map((group) => ({
					hint: group.diagnostics[0].message,
					label: `${SEVERITY_MARK[group.severity]} ${group.rule} (${group.diagnostics.length})`,
					value: group,
				})),
				{ label: "Back", value: "back" as const },
			],
		});

		if (isCancel(choice) || choice === "back") {
			return;
		}
		if ((await reviewGroup(choice, targetPath)) === "cancel") {
			return;
		}
	}
};
