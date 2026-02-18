import { noRepositoryInControllers } from "./architecture/no-repository-in-controllers.js";
import { preferReadonlyInjection } from "./correctness/prefer-readonly-injection.js";
import { noHardcodedSecrets } from "./security/no-hardcoded-secrets.js";
import type { Rule } from "./types.js";

export const allRules: Rule[] = [
	preferReadonlyInjection,
	noRepositoryInControllers,
	noHardcodedSecrets,
];

export function getRules(): Rule[] {
	return [...allRules];
}
