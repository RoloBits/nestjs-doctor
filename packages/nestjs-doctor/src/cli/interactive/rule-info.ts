import { allRules } from "../../engine/rules/index.js";
import type { RuleMeta } from "../../engine/rules/types.js";
import { getRuleExamples } from "../../report/data/examples.js";

interface RuleInfo {
	bad?: string;
	description?: string;
	good?: string;
}

let cache: Map<string, RuleInfo> | null = null;

const build = (): Map<string, RuleInfo> => {
	const examples = getRuleExamples();
	const metaById = new Map<string, RuleMeta>(
		allRules.map((rule) => [rule.meta.id, rule.meta])
	);
	const ids = new Set([...metaById.keys(), ...Object.keys(examples)]);
	const infos = new Map<string, RuleInfo>();
	for (const id of ids) {
		infos.set(id, {
			...(metaById.get(id)?.description
				? { description: metaById.get(id)?.description }
				: {}),
			...(examples[id]
				? { bad: examples[id].bad, good: examples[id].good }
				: {}),
		});
	}
	return infos;
};

/**
 * The rule's own description and sample pair. Empty for a custom rule, which
 * carries neither.
 */
export const ruleInfo = (id: string): RuleInfo => {
	cache ??= build();
	return cache.get(id) ?? {};
};
