import type { DeclaredDependencies } from "../project-detector.js";
import type { Advisory } from "./data.js";
import { NESTJS_ADVISORIES } from "./data.js";
import { installedVersion } from "./installed.js";
import {
	compareVersions,
	rangeIsWhollyBelow,
	rangeReaches,
} from "./version.js";

const BACKSLASH_RE = /\\/g;

/** Diagnostics carry posix paths, whatever the platform reports. */
export const toPosix = (path: string): string =>
	path.replace(BACKSLASH_RE, "/");

export interface AdvisoryMatch {
	advisory: Advisory;
	/** The version on disk, or null when only the range was available. */
	installed: string | null;
	spec: string;
}

const manifestDirOf = (manifestPath: string): string =>
	manifestPath.slice(0, Math.max(manifestPath.lastIndexOf("/"), 0)) ||
	manifestPath;

function applies(advisory: Advisory, version: string): boolean {
	if (compareVersions(version, advisory.patched) !== -1) {
		return false;
	}
	return !(
		advisory.atLeast && compareVersions(version, advisory.atLeast) === -1
	);
}

/** Advisories applying to a project, by installed version then by range. */
export function matchAdvisories(
	dependencies: DeclaredDependencies,
	severities: ReadonlySet<Advisory["severity"]>
): AdvisoryMatch[] {
	const { manifestPath, versions } = dependencies;
	if (!manifestPath) {
		return [];
	}
	const directory = manifestDirOf(toPosix(manifestPath));
	const matches: AdvisoryMatch[] = [];

	for (const advisory of NESTJS_ADVISORIES) {
		if (!severities.has(advisory.severity)) {
			continue;
		}
		const spec = versions[advisory.packageName];
		if (!spec) {
			continue;
		}

		const installed = installedVersion(directory, advisory.packageName);
		const hit = installed
			? applies(advisory, installed)
			: rangeIsWhollyBelow(spec, advisory.patched) &&
				(!advisory.atLeast || rangeReaches(spec, advisory.atLeast));

		if (hit) {
			matches.push({ advisory, installed, spec });
		}
	}

	return matches;
}
