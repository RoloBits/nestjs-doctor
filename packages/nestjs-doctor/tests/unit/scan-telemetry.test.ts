import { describe, expect, it, vi } from "vitest";
import type { CodeDiagnostic } from "../../src/common/diagnostic.js";
import type { Score } from "../../src/common/result.js";
import { actionContext } from "../../src/telemetry/environment.js";
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
	action: actionContext({}),
	blocking: "error",
	scope: "full",
	config: {
		categoriesDisabled: [],
		customRulesDir: false,
		excludeCount: 0,
		ignoredFileCount: 0,
		ignoredRules: [],
		includeCount: 0,
		minScore: null,
		ruleOverrides: [],
		rulesTurnedOff: [],
	},
	customRulesLoaded: 0,
	diagnostics: [],
	disabledRuleIds: [],
	ecosystem: {
		cloud: [],
		cloudServices: [],
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
					// A local `version` input is a path on the runner; only its
					// classification may travel.
					action: actionContext({
						NESTJS_DOCTOR_GITHUB_ACTION: "v1",
						NESTJS_DOCTOR_ACTION_VERSION:
							"/Users/someone/acme-billing/nestjs-doctor",
					}),
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
		expect(serialized).not.toContain("acme-billing");
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

	it("reports how the official action was triggered", () => {
		const payload = buildScanPayload(
			facts({
				action: actionContext({
					GITHUB_ACTIONS: "true",
					GITHUB_EVENT_NAME: "pull_request",
					NESTJS_DOCTOR_ACTION_ACTOR_ASSOCIATION: "FIRST_TIME_CONTRIBUTOR",
					NESTJS_DOCTOR_ACTION_COMMENT: "true",
					NESTJS_DOCTOR_ACTION_COMMIT_STATUS: "true",
					NESTJS_DOCTOR_ACTION_REVIEW_COMMENTS: "false",
					NESTJS_DOCTOR_ACTION_SARIF: "false",
					NESTJS_DOCTOR_ACTION_VERSION: "latest",
					NESTJS_DOCTOR_GITHUB_ACTION: "v1",
					RUNNER_OS: "Linux",
				}),
				blocking: "warning",
				scope: "changed",
			})
		);

		expect(payload.via_action).toBe(true);
		expect(payload.action_ref).toBe("v1");
		expect(payload.action_version_pin).toBe("latest");
		expect(payload.ci_event).toBe("pull_request");
		expect(payload.ci_provider).toBe("github");
		expect(payload.runner_os).toBe("Linux");
		expect(payload.action_comment).toBe(true);
		expect(payload.action_review_comments).toBe(false);
		expect(payload.actor_association).toBe("FIRST_TIME_CONTRIBUTOR");
		// Taken from what the CLI resolved, not from the raw action input.
		expect(payload.scope).toBe("changed");
		expect(payload.blocking).toBe("warning");
	});

	it("separates a hand-rolled CI step from the official action", () => {
		const payload = buildScanPayload(
			facts({
				action: actionContext({
					GITHUB_ACTIONS: "true",
					GITHUB_EVENT_NAME: "push",
					RUNNER_OS: "Linux",
				}),
			})
		);

		expect(payload.via_action).toBe(false);
		expect(payload.action_ref).toBeNull();
		expect(payload.action_comment).toBeNull();
		expect(payload.action_review_comments).toBeNull();
		expect(payload.actor_association).toBeNull();
		expect(payload.action_version_pin).toBeNull();
		// The runner still describes itself.
		expect(payload.ci_event).toBe("push");
		expect(payload.ci_provider).toBe("github");
	});

	it("drops a value that is not in the vocabulary", () => {
		const payload = buildScanPayload(
			facts({
				action: actionContext({
					GITHUB_EVENT_NAME: "repository_dispatch",
					NESTJS_DOCTOR_ACTION_ACTOR_ASSOCIATION: "PRESIDENT",
					NESTJS_DOCTOR_ACTION_COMMENT: "yes",
					NESTJS_DOCTOR_GITHUB_ACTION: "../../etc/passwd",
					RUNNER_OS: "Plan9",
				}),
			})
		);

		expect(payload.actor_association).toBeNull();
		expect(payload.action_comment).toBeNull();
		expect(payload.runner_os).toBeNull();
		// Set, so the run came from the action; the ref itself is unusable.
		expect(payload.via_action).toBe(true);
		expect(payload.action_ref).toBeNull();
		// An unlisted trigger still counts, without naming itself.
		expect(payload.ci_event).toBe("other");
	});

	it("reads the ambient environment when given none", () => {
		// The pipeline calls actionContext() with no argument; every other test
		// injects one, so the default parameter is otherwise never exercised.
		vi.stubEnv("NESTJS_DOCTOR_GITHUB_ACTION", "v1");
		try {
			expect(actionContext().viaAction).toBe(true);
			expect(actionContext().actionRef).toBe("v1");
		} finally {
			vi.unstubAllEnvs();
		}
	});

	it("classifies the version pin without forwarding the spec", () => {
		const pin = (version: string) =>
			actionContext({ NESTJS_DOCTOR_ACTION_VERSION: version }).actionVersionPin;

		expect(pin("latest")).toBe("latest");
		expect(pin("1.4.2")).toBe("pinned");
		expect(pin("nestjs-doctor@1.4.2")).toBe("pinned");
		expect(pin("./local/checkout")).toBe("local");
		expect(pin("/abs/path")).toBe("local");
		expect(pin("file:../sibling")).toBe("local");
		expect(pin("")).toBeNull();
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
