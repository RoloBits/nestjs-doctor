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
	env: {},
	fileCount: 4,
	isEnabled: () => true,
	monorepo: false,
	optionsTelemetry: true,
	outputFormat: "console",
	resolveIdentityFn: vi.fn(() => ({
		anonymousId: "anon-123",
		projectId: "proj-hash",
		stored: true,
	})),
	result: { ...emptyResult(), elapsedMs: 12.7 },
	scanConfig: scanConfigFixture(),
	scanId: "8f1c4a2e-0b3d-4f56-9a71-2c5d8e0f3b64",
	scopeRequested: "full",
	send: vi.fn(() => true),
	subProjectOptOut: false,
	suppressed: {},
	targetPath: "/repo/app",
	totalMs: 18.4,
	...overrides,
});

describe("scan telemetry reporter", () => {
	it("resolves the identity and sends the payload to the anonymous id", () => {
		const input = buildInput();

		reportScanTelemetry(input);

		expect(input.resolveIdentityFn).toHaveBeenCalledWith(
			"/repo/app",
			input.env ?? process.env
		);
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

	it("sends the scan id it was handed", () => {
		const input = buildInput({
			scanId: "1b7f0e42-9c3a-4d18-8e55-6a2f0c9d4b31",
		});

		reportScanTelemetry(input);

		expect(input.send).toHaveBeenCalledWith(
			expect.objectContaining({
				scan_id: "1b7f0e42-9c3a-4d18-8e55-6a2f0c9d4b31",
			}),
			"anon-123"
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

	it("hands the identity resolver the environment it was given", () => {
		const env = { NESTJS_DOCTOR_CONFIG_DIR: "/nowhere" };
		const input = buildInput({ env });

		reportScanTelemetry(input);

		expect(input.resolveIdentityFn).toHaveBeenCalledWith("/repo/app", env);
	});

	it("sends one payload carrying every field, on a run that stores its first id", () => {
		// Pins the payload against the removal of the first-run notice: the same
		// 50 fields go out, in one send, on the run that used to print it.
		const input = buildInput();

		reportScanTelemetry(input);

		expect(input.send).toHaveBeenCalledTimes(1);
		expect(input.send).toHaveBeenCalledWith(expect.anything(), "anon-123");
		expect(Object.keys(input.send.mock.calls[0]?.[0] ?? {}).sort()).toEqual([
			"action_comment",
			"action_commit_status",
			"action_ref",
			"action_review_comments",
			"action_sarif",
			"action_version_pin",
			"actor_association",
			"blocking",
			"categories_disabled",
			"ci_event",
			"ci_provider",
			"cloud",
			"cloud_services",
			"config_exclude_count",
			"config_include_count",
			"config_min_score",
			"custom_rules_dir",
			"custom_rules_loaded",
			"databases",
			"duration_ms",
			"file_count",
			"findings",
			"framework",
			"frontend",
			"generated_in",
			"ignored_file_count",
			"ignored_rules",
			"messaging",
			"monorepo",
			"nest_version",
			"nestjs_packages",
			"node_major",
			"orm",
			"output_format",
			"platform",
			"project_id",
			"report_requested",
			"rule_errors",
			"rule_overrides",
			"rules_disabled",
			"rules_turned_off",
			"rules_with_findings",
			"scan_id",
			"scope_requested",
			"score",
			"suppressed_inline",
			"total_ms",
			"trigger",
			"version",
			"via_action",
		]);
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
