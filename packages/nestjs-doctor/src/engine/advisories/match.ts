import type { Advisory } from "./data.js";
import { NESTJS_ADVISORIES } from "./data.js";
import { compareVersions, lowestAllowed } from "./version.js";

const BACKSLASH_RE = /\\/g;
const TRAILING_SLASH_RE = /\/$/;

/** Diagnostics carry posix paths, whatever the platform reports. */
export const packageJsonPath = (targetPath: string): string =>
	`${targetPath.replace(BACKSLASH_RE, "/").replace(TRAILING_SLASH_RE, "")}/package.json`;

export interface AdvisoryMatch {
	advisory: Advisory;
	installed: string;
}

/**
 * Advisories that apply to the declared versions. A range is read at its
 * floor, the oldest version it still allows, which is what a fresh install
 * without a lockfile can produce.
 */
export function matchAdvisories(
	dependencies: Record<string, string>,
	severities: ReadonlySet<Advisory["severity"]>
): AdvisoryMatch[] {
	const matches: AdvisoryMatch[] = [];

	for (const advisory of NESTJS_ADVISORIES) {
		if (!severities.has(advisory.severity)) {
			continue;
		}
		const declared = dependencies[advisory.packageName];
		if (!declared) {
			continue;
		}
		const installed = lowestAllowed(declared);
		if (!installed) {
			continue;
		}
		if (compareVersions(installed, advisory.patched) !== -1) {
			continue;
		}
		if (
			advisory.atLeast &&
			compareVersions(installed, advisory.atLeast) === -1
		) {
			continue;
		}
		matches.push({ advisory, installed });
	}

	return matches;
}
