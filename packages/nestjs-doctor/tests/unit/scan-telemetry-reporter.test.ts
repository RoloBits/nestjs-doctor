import { describe, expect, it, vi } from "vitest";
import { getCliVersion } from "../../src/cli/output.js";
import {
	reportScanTelemetry,
	type ScanTelemetryInput,
} from "../../src/cli/scan-telemetry-reporter.js";
import type { Rule } from "../../src/engine/rules/types.js";
import type { ScanConfig } from "../../src/engine/scanner.js";
import { emptyResult } from "./report-artifact-fixture.js";

const ruleWithId = (id: string): Rule => ({ meta: { id } }) as unknown as Rule;

const scanConfigFixture = (): ScanConfig =>
	({
		combinedRules: [
			ruleWithId("performance/no-unused-providers"),
			ruleWithId("custom/acme-internal"),
		],
		config: { minScore: 70 },
		customRuleWarnings: [],
		fileRules: [ruleWithId("performance/no-unused-providers")],
		projectRules: [],
		schemaRules: [],
	}) as unknown as ScanConfig;

const buildInput = (
	overrides: Partial<ScanTelemetryInput> = {}
): ScanTelemetryInput => ({
	blocking: "error",
	diagnostics: [],
	fileCount: 4,
	isEnabled: () => true,
	monorepo: false,
	optionsTelemetry: true,
	resolveIdentityFn: vi.fn(() => ({
		anonymousId: "anon-123",
		projectId: "proj-hash",
	})),
	result: { ...emptyResult(), elapsedMs: 12.7 },
	scanConfig: scanConfigFixture(),
	scopeRequested: "full",
	send: vi.fn(),
	subProjectOptOut: false,
	targetPath: "/repo/app",
	...overrides,
});

describe("scan telemetry reporter", () => {
	it("resolves the identity and sends the payload to the anonymous id", () => {
		const input = buildInput();

		reportScanTelemetry(input);

		expect(input.resolveIdentityFn).toHaveBeenCalledWith("/repo/app");
		expect(input.send).toHaveBeenCalledTimes(1);
		expect(input.send).toHaveBeenCalledWith(
			expect.objectContaining({
				blocking: "error",
				config_min_score: 70,
				custom_rules_loaded: 1,
				duration_ms: 13,
				file_count: 4,
				framework: "express",
				monorepo: false,
				nest_version: "11.0.0",
				orm: "prisma",
				project_id: "proj-hash",
				rules_disabled: expect.arrayContaining([
					"security/no-hardcoded-secrets",
				]),
				score: 90,
				scope_requested: "full",
				version: getCliVersion(),
			}),
			"anon-123"
		);
		expect(input.send.mock.calls[0]?.[0].rules_disabled).not.toContain(
			"performance/no-unused-providers"
		);
	});

	it("keeps custom rule names out of the disabled list", () => {
		const input = buildInput();

		reportScanTelemetry(input);

		expect(
			JSON.stringify(input.send.mock.calls[0]?.[0].rules_disabled)
		).not.toContain("custom/");
	});

	it("sends nothing when a sub-project opted out", () => {
		const isEnabled = vi.fn(() => true);
		const resolveIdentityFn = vi.fn();
		const input = buildInput({
			isEnabled,
			resolveIdentityFn,
			subProjectOptOut: true,
		});

		reportScanTelemetry(input);

		expect(input.send).not.toHaveBeenCalled();
		expect(resolveIdentityFn).not.toHaveBeenCalled();
		expect(isEnabled).not.toHaveBeenCalled();
	});

	it("sends nothing when telemetry is disabled", () => {
		const isEnabled = vi.fn(() => false);
		const resolveIdentityFn = vi.fn();
		const input = buildInput({ isEnabled, resolveIdentityFn });

		reportScanTelemetry(input);

		expect(input.send).not.toHaveBeenCalled();
		expect(resolveIdentityFn).not.toHaveBeenCalled();
	});

	it("swallows a throw from sending", () => {
		const input = buildInput({
			send: vi.fn(() => {
				throw new Error("network down");
			}),
		});

		expect(() => reportScanTelemetry(input)).not.toThrow();
	});

	it("swallows a throw from resolving the identity", () => {
		const input = buildInput({
			resolveIdentityFn: vi.fn(() => {
				throw new Error("fs gone");
			}),
		});

		expect(() => reportScanTelemetry(input)).not.toThrow();
		expect(input.send).not.toHaveBeenCalled();
	});
});
