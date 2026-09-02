import type { Diagnostic } from "../common/diagnostic.js";
import type { DiagnoseResult } from "../common/result.js";
import type { ScopeMode } from "../common/scope.js";
import { allRules } from "../engine/rules/index.js";
import type { ScanConfig } from "../engine/scanner.js";
import { getEcosystem } from "../telemetry/ecosystem.js";
import { actionContext, generatedIn } from "../telemetry/environment.js";
import { hasStoredIdentity, resolveIdentity } from "../telemetry/install-id.js";
import {
	buildScanPayload,
	type PayloadOutputFormat,
	readConfigFacts,
} from "../telemetry/scan-telemetry.js";
import { scanTelemetryEnabled, sendScanTelemetry } from "../telemetry/send.js";
import type { BlockingLevel } from "./blocking.js";
import { getCliVersion } from "./output.js";

export interface ScanTelemetryInput {
	blocking: BlockingLevel;
	diagnostics: Diagnostic[];
	/** Injectable for tests; defaults to the real environment. */
	env?: NodeJS.ProcessEnv;
	fileCount: number;
	/** Injectable for tests; defaults to the read-only store check. */
	hasStoredIdentityFn?: typeof hasStoredIdentity;
	/** Injectable for tests; defaults to the compiled-in gating. */
	isEnabled?: typeof scanTelemetryEnabled;
	monorepo: boolean;
	optionsTelemetry: boolean;
	outputFormat: PayloadOutputFormat;
	/** Injectable for tests; defaults to the real install-id resolver. */
	resolveIdentityFn?: typeof resolveIdentity;
	result: DiagnoseResult;
	scanConfig: ScanConfig | undefined;
	scanId: string;
	scopeRequested: ScopeMode;
	/** Injectable for tests; defaults to the detached-child sender. */
	send?: typeof sendScanTelemetry;
	subProjectOptOut: boolean;
	/** Inline-directive suppression counts, keyed by rule id. */
	suppressed: Record<string, number>;
	targetPath: string;
	totalMs: number;
}

/**
 * Reports the scan anonymously from a detached child and returns whether that
 * was this install's first send. A failure here leaves the scan untouched.
 */
export const reportScanTelemetry = (input: ScanTelemetryInput): boolean => {
	const isEnabled = input.isEnabled ?? scanTelemetryEnabled;
	if (
		input.subProjectOptOut ||
		!isEnabled(input.optionsTelemetry, input.scanConfig?.config)
	) {
		return false;
	}
	// Read before resolveIdentity, which writes the store.
	const env = input.env ?? process.env;
	const hadStore = (input.hasStoredIdentityFn ?? hasStoredIdentity)(env);
	let stored = false;
	let sent = false;
	try {
		const identity = (input.resolveIdentityFn ?? resolveIdentity)(
			input.targetPath,
			env
		);
		stored = identity.stored;
		const scanConfig = input.scanConfig as ScanConfig;
		const enabled = new Set(
			[
				...scanConfig.fileRules,
				...scanConfig.projectRules,
				...scanConfig.schemaRules,
			].map((rule) => rule.meta.id)
		);
		sent = (input.send ?? sendScanTelemetry)(
			buildScanPayload({
				action: actionContext(env),
				blocking: input.blocking,
				config: readConfigFacts(scanConfig.config),
				customRulesLoaded: scanConfig.combinedRules.filter((rule) =>
					rule.meta.id.startsWith("custom/")
				).length,
				diagnostics: input.diagnostics,
				disabledRuleIds: allRules
					.map((rule) => rule.meta.id)
					.filter((id) => !enabled.has(id)),
				ecosystem: getEcosystem(),
				elapsedMs: input.result.elapsedMs,
				fileCount: input.fileCount,
				framework: input.result.project.framework,
				monorepo: input.monorepo,
				nestVersion: input.result.project.nestVersion,
				orm: input.result.project.orm,
				outputFormat: input.outputFormat,
				projectId: identity.projectId,
				ruleErrors: input.result.ruleErrors,
				scanId: input.scanId,
				scopeRequested: input.scopeRequested,
				score: input.result.score,
				source: generatedIn(),
				suppressed: input.suppressed,
				totalMs: input.totalMs,
				version: getCliVersion(),
			}),
			identity.anonymousId
		);
	} catch {
		// Reporting never breaks a scan.
		return false;
	}
	return generatedIn(env) === "cli" && !hadStore && stored && sent;
};
