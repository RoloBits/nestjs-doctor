import { describe, expect, it, vi } from "vitest";
import { getCliVersion } from "../../src/cli/output.js";
import {
	reportScanTelemetry,
	type ScanTelemetryInput,
} from "../../src/cli/scan-telemetry-reporter.js";
import type { Rule } from "../../src/engine/rules/types.js";
import type { ScanConfig } from "../../src/engine/scanner.js";
import { telemetryNoticeSite } from "../../src/telemetry/send.js";
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
	hasStoredIdentityFn: () => false,
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

		expect(reportScanTelemetry(input)).toBe(false);
	});

	it("reports the first send an install ever makes", () => {
		expect(reportScanTelemetry(buildInput())).toBe(true);
	});

	it("reports nothing new once the install has a stored id", () => {
		expect(
			reportScanTelemetry(buildInput({ hasStoredIdentityFn: () => true }))
		).toBe(false);
	});

	it("hands the identity resolver the same environment it read the store from", () => {
		const env = { NESTJS_DOCTOR_CONFIG_DIR: "/nowhere" };
		const input = buildInput({ env });

		reportScanTelemetry(input);

		expect(input.resolveIdentityFn).toHaveBeenCalledWith("/repo/app", env);
	});

	it("reads the store before the identity resolver writes one", () => {
		const order: string[] = [];
		const input = buildInput({
			hasStoredIdentityFn: vi.fn(() => {
				order.push("read");
				return false;
			}),
			resolveIdentityFn: vi.fn(() => {
				order.push("resolve");
				return { anonymousId: "anon-123", stored: true };
			}),
		});

		reportScanTelemetry(input);

		expect(order).toEqual(["read", "resolve"]);
	});

	it("announces no first send when the id could not be stored", () => {
		const input = buildInput({
			resolveIdentityFn: vi.fn(() => ({
				anonymousId: "anon-123",
				stored: false,
			})),
		});

		expect(reportScanTelemetry(input)).toBe(false);
		expect(input.send).toHaveBeenCalledTimes(1);
	});

	it("announces no first send when nothing was sent", () => {
		expect(reportScanTelemetry(buildInput({ isEnabled: () => false }))).toBe(
			false
		);
		expect(reportScanTelemetry(buildInput({ subProjectOptOut: true }))).toBe(
			false
		);
	});

	it("announces no first send when the sender only printed the payload", () => {
		const input = buildInput({ send: vi.fn(() => false) });

		expect(reportScanTelemetry(input)).toBe(false);
		expect(input.send).toHaveBeenCalledTimes(1);
	});

	it("announces no first send from CI, which stores no id", () => {
		expect(reportScanTelemetry(buildInput({ env: { CI: "true" } }))).toBe(
			false
		);
		expect(
			reportScanTelemetry(buildInput({ env: { GITHUB_ACTIONS: "true" } }))
		).toBe(false);
	});

	it("swallows a throw from resolving the identity", () => {
		const input = buildInput({
			resolveIdentityFn: vi.fn(() => {
				throw new Error("fs gone");
			}),
		});

		expect(reportScanTelemetry(input)).toBe(false);
		expect(input.send).not.toHaveBeenCalled();
	});
});

describe("where the first-run notice prints", () => {
	const site = (overrides: Parameters<typeof telemetryNoticeSite>[0]) =>
		telemetryNoticeSite(overrides);

	it("waits for the menu to close on an interactive run", () => {
		// A line printed before the TUI is lost with the alternate screen.
		expect(
			site({ firstSend: true, interactive: true, isMachineReadable: false })
		).toBe("menu");
	});

	it("prints at the end of a run with no menu", () => {
		expect(
			site({ firstSend: true, interactive: false, isMachineReadable: false })
		).toBe("run");
	});

	it("prints nowhere for a machine-readable run or a later scan", () => {
		expect(
			site({ firstSend: true, interactive: true, isMachineReadable: true })
		).toBe("none");
		expect(
			site({ firstSend: false, interactive: false, isMachineReadable: false })
		).toBe("none");
	});
});
