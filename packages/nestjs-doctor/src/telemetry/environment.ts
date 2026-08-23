/** Any value other than the shell's own "off" spellings counts as set. */
export const isSet = (value: string | undefined): boolean =>
	value !== undefined && value !== "" && value !== "0" && value !== "false";

/**
 * Where the scan ran. For a report this is stamped at generation time: a CI
 * machine opens no browser, so a `ci` event is one a person opened later.
 */
export function generatedIn(
	env: NodeJS.ProcessEnv = process.env
): "ci" | "cli" {
	return isSet(env.CI) || isSet(env.GITHUB_ACTIONS) ? "ci" : "cli";
}
