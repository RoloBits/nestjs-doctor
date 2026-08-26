import type { Diagnostic } from "../common/diagnostic.js";
import type { DiagnoseResult } from "../common/result.js";
import type { ScopeMode } from "../common/scope.js";
import { allRules } from "../engine/rules/index.js";
import type { ScanConfig } from "../engine/scanner.js";
import { getEcosystem } from "../telemetry/ecosystem.js";
import { actionContext, generatedIn } from "../telemetry/environment.js";
import { resolveIdentity } from "../telemetry/install-id.js";
import {
	buildScanPayload,
	readConfigFacts,
} from "../telemetry/scan-telemetry.js";
import { scanTelemetryEnabled, sendScanTelemetry } from "../telemetry/send.js";
import type { BlockingLevel } from "./blocking.js";
import { getCliVersion } from "./output.js";

export interface ScanTelemetryInput {
	blocking: BlockingLevel;
	diagnostics: Diagnostic[];
	fileCount: number;
	/** Injectable for tests; defaults to the compiled-in gating. */
	isEnabled?: typeof scanTelemetryEnabled;
	monorepo: boolean;
	optionsTelemetry: boolean;
	/** Injectable for tests; defaults to the real install-id resolver. */
	resolveIdentityFn?: typeof resolveIdentity;
	result: DiagnoseResult;
	scanConfig: ScanConfig | undefined;
	scopeRequested: ScopeMode;
	/** Injectable for tests; defaults to the detached-child sender. */
	send?: typeof sendScanTelemetry;
	subProjectOptOut: boolean;
	targetPath: string;
}

/**
 * Reports the scan anonymously. A failure here leaves the scan untouched,
 * and the network call runs in a detached child.
 */
export const reportScanTelemetry = (input: ScanTelemetryInput): void => {
	const isEnabled = input.isEnabled ?? scanTelemetryEnabled;
	if (
		input.subProjectOptOut ||
		!isEnabled(input.optionsTelemetry, input.scanConfig?.config)
	) {
		return;
	}
	try {
		const identity = (input.resolveIdentityFn ?? resolveIdentity)(
			input.targetPath
		);
		const scanConfig = input.scanConfig as ScanConfig;
		const enabled = new Set(
			[
				...scanConfig.fileRules,
				...scanConfig.projectRules,
				...scanConfig.schemaRules,
			].map((rule) => rule.meta.id)
		);
		(input.send ?? sendScanTelemetry)(
			buildScanPayload({
				action: actionContext(),
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
				projectId: identity.projectId,
				ruleErrors: input.result.ruleErrors,
				scopeRequested: input.scopeRequested,
				score: input.result.score,
				source: generatedIn(),
				version: getCliVersion(),
			}),
			identity.anonymousId
		);
	} catch {
		// Reporting never breaks a scan.
	}
};
