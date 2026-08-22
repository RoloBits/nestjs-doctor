import type { Advisory } from "./data.js";
import { NESTJS_ADVISORIES } from "./data.js";
import { installedVersion } from "./installed.js";
import type { Declaration, Manifest } from "./manifest.js";
import {
	compareVersions,
	parse,
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
	severities: ReadonlySet<Advisory["severity"]>,
	installRoot?: string
): MatchResult {
	const { path, versions } = manifest;
	// Resolves the install from the working tree when one is named.
	const directory = installRoot
		? installRoot.replace(/\\/g, "/")
		: manifestDirOf(path);
	const matches: AdvisoryMatch[] = [];
	const unchecked = new Set<string>();
	// Walks once per package, not once per advisory row.
	const resolved = new Map<string, string | null>();
	const versionOf = (name: string): string | null => {
		let version = resolved.get(name);
		if (version === undefined) {
			version = installedVersion(directory, name);
			resolved.set(name, version);
		}
		return version;
	};

	for (const advisory of NESTJS_ADVISORIES) {
		const declaration = versions[advisory.packageName];
		if (!declaration) {
			continue;
		}
		const { spec } = declaration;
		const installed = versionOf(advisory.packageName);

		// Runs before the severity filter.
		if (installed ? !parse(installed) : !parseRange(spec)) {
			unchecked.add(advisory.packageName);
			continue;
		}

		if (!severities.has(advisory.severity)) {
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
