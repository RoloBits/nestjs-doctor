/** Any value other than the shell's own "off" spellings counts as set. */
export const isSet = (value: string | undefined): boolean =>
	value !== undefined && value !== "" && value !== "0" && value !== "false";

/** Where the scan ran. A report stamps this at generation time. */
export function generatedIn(
	env: NodeJS.ProcessEnv = process.env
): "ci" | "cli" {
	return isSet(env.CI) || isSet(env.GITHUB_ACTIONS) ? "ci" : "cli";
}
