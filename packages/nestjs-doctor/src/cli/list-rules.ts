import type { Category } from "../common/diagnostic.js";
import { getRules } from "../engine/rules/index.js";
import type { RuleMeta } from "../engine/rules/types.js";
import { highlighter } from "../ui/highlighter.js";
import { logger } from "../ui/logger.js";

const CATEGORY_ORDER: Category[] = [
	"security",
	"correctness",
	"architecture",
	"performance",
	"schema",
];

const colorizeSeverity = (severity: RuleMeta["severity"]): string => {
	if (severity === "error") {
		return highlighter.error(severity);
	}
	if (severity === "warning") {
		return highlighter.warn(severity);
	}
	return highlighter.info(severity);
};

/** Prints the built-in rule catalogue. Custom rules need a resolved config. */
export function listRules(asJson: boolean): void {
	const rules = getRules().map((rule) => rule.meta);

	if (asJson) {
		console.log(
			JSON.stringify(
				rules.map(({ id, category, severity, description, help, scope }) => ({
					id,
					category,
					severity,
					scope: scope ?? "file",
					description,
					help,
				})),
				null,
				2
			)
		);
		return;
	}

	const byCategory = new Map<Category, RuleMeta[]>();
	for (const meta of rules) {
		const bucket = byCategory.get(meta.category) ?? [];
		bucket.push(meta);
		byCategory.set(meta.category, bucket);
	}

	const width = Math.max(...rules.map((meta) => meta.id.length));

	logger.break();
	logger.log(`${rules.length} built-in rules`);

	const categories = [
		...CATEGORY_ORDER.filter((category) => byCategory.has(category)),
		...[...byCategory.keys()].filter(
			(category) => !CATEGORY_ORDER.includes(category)
		),
	];

	for (const category of categories) {
		const metas = byCategory.get(category) ?? [];
		logger.break();
		logger.log(highlighter.dim(`${category} (${metas.length})`));
		for (const meta of metas.sort((a, b) => a.id.localeCompare(b.id))) {
			logger.log(
				`  ${meta.id.padEnd(width)}  ${colorizeSeverity(meta.severity).padEnd(8)}  ${highlighter.dim(meta.description)}`
			);
		}
	}
	logger.break();
}
