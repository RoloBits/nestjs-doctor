const DUPLICATE_MODULE_RE = /^@Module class .+ is declared in \d+ files /;

/** Console warning lines, with repeated duplicate-module warnings collapsed. */
export function summarizeWarnings(
	warnings: string[],
	verbose: boolean
): string[] {
	const duplicates = warnings.filter((w) => DUPLICATE_MODULE_RE.test(w));
	if (verbose || duplicates.length <= 1) {
		return warnings;
	}
	const rest = warnings.filter((w) => !DUPLICATE_MODULE_RE.test(w));
	return [
		...rest,
		`${duplicates.length} @Module class names are declared in more than one file each; each name's declarations are analyzed as one module (--verbose lists them)`,
	];
}
