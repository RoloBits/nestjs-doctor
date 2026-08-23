import { describe, expect, it } from "vitest";
import type { CodeDiagnostic } from "../../src/common/diagnostic.js";
import type { Score } from "../../src/common/result.js";
import {
	buildScanPayload,
	type ScanFacts,
} from "../../src/telemetry/scan-telemetry.js";
import { scanTelemetryEnabled } from "../../src/telemetry/send.js";

const code = (overrides: Partial<CodeDiagnostic>): CodeDiagnostic => ({
	rule: "performance/no-unused-providers",
	category: "performance",
	severity: "warning",
	filePath: "/Users/someone/acme-billing/src/a.service.ts",
	message: "Provider is never injected.",
	help: "Remove it.",
	line: 3,
	column: 1,
	...overrides,
});

const facts = (overrides: Partial<ScanFacts> = {}): ScanFacts => ({
	customRulesLoaded: 0,
	diagnostics: [],
	disabledRuleIds: [],
	ecosystem: {
		cloud: [],
		databases: [],
		frontend: [],
		messaging: [],
		nestjsPackages: [],
	},
	elapsedMs: 12.7,
	fileCount: 4,
	framework: "express",
	monorepo: false,
	nestVersion: "11.0.0",
	orm: "prisma",
	ruleErrors: [],
	score: { value: 90, label: "Excellent" } as Score,
	source: "cli",
	version: "1.2.3",
	...overrides,
});

describe("scan telemetry payload", () => {
	it("counts findings per built-in rule and severity", () => {
		const payload = buildScanPayload(
			facts({
				diagnostics: [
					code({}),
					code({}),
					code({ rule: "security/no-hardcoded-secrets", severity: "error" }),
				],
			})
		);

		expect(payload.findings).toEqual({
			"performance/no-unused-providers": { warning: 2 },
			"security/no-hardcoded-secrets": { error: 1 },
		});
		expect(payload.rules_with_findings).toBe(2);
	});

	it("never names a custom rule", () => {
		const payload = buildScanPayload(
			facts({
				customRulesLoaded: 2,
				diagnostics: [code({ rule: "custom/acme-no-legacy-billing-import" })],
				disabledRuleIds: ["custom/acme-internal-convention"],
				ruleErrors: [
					{ ruleId: "custom/acme-secret-scanner", error: "boom" },
					{ ruleId: "security/no-eval", error: "boom" },
				],
			})
		);

		const serialized = JSON.stringify(payload);
		expect(serialized).not.toContain("acme");
		expect(payload.findings).toEqual({});
		expect(payload.rules_disabled).toEqual([]);
		expect(payload.rule_errors).toEqual(["security/no-eval"]);
		// The count still travels, so custom-rule adoption is measurable.
		expect(payload.custom_rules_loaded).toBe(2);
	});

	it("carries no path, message, or source text", () => {
		const serialized = JSON.stringify(
			buildScanPayload(
				facts({
					diagnostics: [code({})],
					ruleErrors: [
						{
							ruleId: "security/no-eval",
							error:
								"Cannot read file /Users/someone/acme-billing/src/secret.ts",
						},
					],
				})
			)
		);

		expect(serialized).not.toContain("/Users");
		expect(serialized).not.toContain("secret.ts");
		expect(serialized).not.toContain("Provider is never injected");
		expect(serialized).not.toContain("Cannot read file");
	});

	it("reports the environment without identifying the machine", () => {
		const payload = buildScanPayload(
			facts({ monorepo: true, source: "ci" }),
			"v22.11.0",
			"linux"
		);

		expect(payload.node_major).toBe(22);
		expect(payload.platform).toBe("linux");
		expect(payload.generated_in).toBe("ci");
		expect(payload.monorepo).toBe(true);
		expect(payload.duration_ms).toBe(13);
	});
});

describe("scan telemetry gating", () => {
	it("stays off without a compiled key, whatever the flag says", () => {
		expect(scanTelemetryEnabled(true, undefined, {}, "")).toBe(false);
	});

	it("is on by default with a key compiled in", () => {
		expect(scanTelemetryEnabled(true, undefined, {})).toBe(true);
	});

	it("honours the flag, the config, and DO_NOT_TRACK", () => {
		const on = (
			flag: boolean,
			config: { telemetry?: boolean } | undefined,
			env: NodeJS.ProcessEnv
		) => scanTelemetryEnabled(flag, config, env, "phc_key");

		expect(on(true, undefined, {})).toBe(true);
		expect(on(false, undefined, {})).toBe(false);
		expect(on(true, { telemetry: false }, {})).toBe(false);
		expect(on(true, { telemetry: true }, {})).toBe(true);
		expect(on(true, undefined, { DO_NOT_TRACK: "1" })).toBe(false);
		// Set-but-off is not a request to stop.
		expect(on(true, undefined, { DO_NOT_TRACK: "0" })).toBe(true);
	});
});
