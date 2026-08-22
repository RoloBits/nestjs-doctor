import type { Advisory } from "./data.js";
import { NESTJS_ADVISORIES } from "./data.js";
import { installedVersion } from "./installed.js";
import type { Declaration, Manifest } from "./manifest.js";
import {
	compareVersions,
	parseRange,
	rangeIsWhollyBelow,
	rangeReaches,
} from "./version.js";

export interface AdvisoryMatch {
	advisory: Advisory;
	declaration: Declaration;
	/** The version on disk, or null when only the range was available. */
	installed: string | null;
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
interface MatchResult {
	matches: AdvisoryMatch[];
	/** Declared packages whose version could not be established. */
	unchecked: string[];
}

export function matchAdvisories(
	manifest: Manifest,
	severities: ReadonlySet<Advisory["severity"]>
): MatchResult {
	const { path, versions } = manifest;
	const directory = manifestDirOf(path);
	const matches: AdvisoryMatch[] = [];
	const unchecked = new Set<string>();

	for (const advisory of NESTJS_ADVISORIES) {
		if (!severities.has(advisory.severity)) {
			continue;
		}
		const declaration = versions[advisory.packageName];
		if (!declaration) {
			continue;
		}
		const { spec } = declaration;

		const installed = installedVersion(directory, advisory.packageName);
		if (!(installed || parseRange(spec))) {
			unchecked.add(advisory.packageName);
			continue;
		}
		const hit = installed
			? applies(advisory, installed)
			: rangeIsWhollyBelow(spec, advisory.patched) &&
				(!advisory.atLeast || rangeReaches(spec, advisory.atLeast));

		if (hit) {
			matches.push({ advisory, declaration, installed });
		}
	}

	return { matches, unchecked: [...unchecked].sort() };
}
