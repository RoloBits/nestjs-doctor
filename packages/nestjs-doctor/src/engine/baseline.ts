import type { Diagnostic } from "../common/diagnostic.js";
import {
	buildAnalysisContext,
	buildMonorepoContext,
} from "./analysis-context.js";
import type { ScanConfig } from "./config/scan-config.js";
import { diagnose } from "./diagnostician.js";
import { diffDiagnostics } from "./fingerprint.js";
import { checkoutBase, getLastGitError } from "./git.js";
import type { MonorepoInfo } from "./project-detector.js";
import type { ResolvedScope } from "./scope.js";

export interface BaselineDelta {
	/** False when the base could not be checked out — callers should degrade. */
	available: boolean;
	/** Findings the change resolved. */
	fixed: number;
	/** Findings with no counterpart at the base. */
	introduced: Diagnostic[];
	warnings: string[];
}

/**
 * Runs the same analysis over a base checkout.
 *
 * The head's resolved config and rule set are reused deliberately: comparing a
 * scan against one run under the base's own config would report every config
 * edit as a wave of introduced or fixed findings.
 */
async function scanBaseline(
	baseTargetPath: string,
	scanConfig: ScanConfig,
	monorepo: MonorepoInfo | undefined
): Promise<Diagnostic[]> {
	if (monorepo) {
		const context = await buildMonorepoContext(
			baseTargetPath,
			scanConfig,
			monorepo
		);
		const diagnostics: Diagnostic[] = [];
		for (const subProject of context.subProjects.values()) {
			diagnostics.push(...diagnose(subProject).diagnostics);
		}
		return diagnostics;
	}

	const context = await buildAnalysisContext(baseTargetPath, scanConfig);
	return diagnose(context).diagnostics;
}

/**
 * Works out which of HEAD's findings the change introduced.
 *
 * Returns `available: false` when the base revision cannot be materialised (a
 * shallow CI clone being the usual cause); the caller then reports the wider
 * `files` scope rather than claiming a clean delta it never measured.
 */
export async function computeBaselineDelta(
	headDiagnostics: Diagnostic[],
	scope: ResolvedScope,
	targetPath: string,
	scanConfig: ScanConfig,
	monorepo?: MonorepoInfo
): Promise<BaselineDelta> {
	const unavailable = (warning: string): BaselineDelta => ({
		available: false,
		fixed: 0,
		introduced: headDiagnostics,
		warnings: [warning],
	});

	if (!(scope.repo && scope.baseRef)) {
		return unavailable(
			"--scope changed needs a base revision to compare against. Reporting every finding in the changed files instead."
		);
	}

	const checkout = checkoutBase(scope.repo, scope.baseRef);
	if (!checkout) {
		const reason = getLastGitError();
		return unavailable(
			`Could not check out "${scope.baseRef}" to compare against (a shallow clone, typically — fetch it with \`fetch-depth: 0\`)${reason ? `: ${reason}` : ""}. Reporting every finding in the changed files instead.`
		);
	}

	try {
		const baseDiagnostics = await scanBaseline(
			checkout.targetPath,
			scanConfig,
			monorepo
		);
		const { introduced, fixed } = diffDiagnostics(
			headDiagnostics,
			baseDiagnostics,
			targetPath,
			checkout.targetPath
		);
		return { available: true, fixed, introduced, warnings: [] };
	} catch (error) {
		const reason = error instanceof Error ? error.message : String(error);
		return unavailable(
			`Could not scan the base revision (${reason}). Reporting every finding in the changed files instead.`
		);
	} finally {
		checkout.cleanup();
	}
}
