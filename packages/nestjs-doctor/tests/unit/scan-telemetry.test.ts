import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import type { CodeDiagnostic } from "../../src/common/diagnostic.js";
import type { Score } from "../../src/common/result.js";
import { ACTION_ENV, actionContext } from "../../src/telemetry/environment.js";
import {
	buildScanPayload,
	type ScanFacts,
} from "../../src/telemetry/scan-telemetry.js";
import {
	reportTelemetryEnabled,
	scanTelemetryEnabled,
} from "../../src/telemetry/send.js";

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
	scopeRequested: "full",
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
				}),
				blocking: "warning",
				scopeRequested: "changed",
			})
		);

		expect(payload.via_action).toBe(true);
		expect(payload.action_ref).toBe("v1");
		expect(payload.action_version_pin).toBe("latest");
		expect(payload.ci_event).toBe("pull_request");
		expect(payload.ci_provider).toBe("github");
		expect(payload.action_comment).toBe(true);
		expect(payload.action_review_comments).toBe(false);
		expect(payload.actor_association).toBe("FIRST_TIME_CONTRIBUTOR");
		// What was asked for: degradation to `files` is decided later, so the
		// payload cannot claim to know whether the baseline was reachable.
		expect(payload.scope_requested).toBe("changed");
		expect(payload.blocking).toBe("warning");
	});

	it("separates a hand-rolled CI step from the official action", () => {
		const payload = buildScanPayload(
			facts({
				action: actionContext({
					GITHUB_ACTIONS: "true",
					GITHUB_EVENT_NAME: "push",
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
				}),
			})
		);

		expect(payload.actor_association).toBeNull();
		expect(payload.action_comment).toBeNull();
		// Set, so the run came from the action; the ref is only ever a shape.
		expect(payload.via_action).toBe(true);
		expect(payload.action_ref).toBe("branch");
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
		const pin = (version?: string, resolved?: string) =>
			actionContext({
				...(version === undefined
					? {}
					: { NESTJS_DOCTOR_ACTION_VERSION: version }),
				...(resolved === undefined
					? {}
					: { NESTJS_DOCTOR_ACTION_RESOLVED: resolved }),
			}).actionVersionPin;

		expect(pin("latest", "1.4.2")).toBe("latest");
		expect(pin("1.4.2", "1.4.2")).toBe("pinned");
		expect(pin("nestjs-doctor@1.4.2", "1.4.2")).toBe("pinned");
		expect(pin("", "1.4.2")).toBe("latest");
		expect(pin()).toBeNull();
		// "local" is the action's own verdict, so the two cannot disagree about
		// a bare relative path the CLI's own regex would have called pinned.
		expect(pin("./local/checkout", "local")).toBe("local");
		expect(pin("packages/nestjs-doctor", "local")).toBe("local");
		expect(pin("file:../sibling", "local")).toBe("local");
	});

	it("classifies the action ref instead of reporting it", () => {
		const ref = (marker: string) =>
			actionContext({ NESTJS_DOCTOR_GITHUB_ACTION: marker }).actionRef;

		expect(ref("v1")).toBe("v1");
		expect(ref("v2.3.1")).toBe("v2");
		// A branch that merely looks like a tag must not pose as the release.
		expect(ref("v1-patched")).toBe("branch");
		expect(ref("a".repeat(40))).toBe("sha");
		// A fork's branch name has no bound, so only the shape is reported.
		expect(ref("feature/whatever-someone-called-it")).toBe("branch");
		expect(ref("../../etc/passwd")).toBe("branch");
		// The sentinel the action writes when github.action_ref is empty.
		expect(ref("1")).toBeNull();
	});

	it("keeps action.yml and the env contract from drifting apart", () => {
		// Nothing observable breaks when these disagree: a renamed input resolves
		// to an empty string, readBoolean returns null, and the field silently
		// reads as "nobody turned it on" forever. The self-test cannot catch it
		// because it sets DO_NOT_TRACK job-wide.
		const actionYml = readFileSync(
			new URL("../../../../action.yml", import.meta.url),
			"utf8"
		);

		for (const variable of Object.values(ACTION_ENV)) {
			expect(actionYml).toContain(`${variable}: \${{`);
		}
		for (const input of [
			"comment",
			"review-comments",
			"commit-status",
			"sarif",
			"version",
			"telemetry",
		]) {
			expect(actionYml).toMatch(new RegExp(`^ {2}${input}:$`, "m"));
		}
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

describe("report telemetry gating", () => {
	it("follows the scan gate and adds the report.telemetry key", () => {
		expect(reportTelemetryEnabled(true, undefined, {})).toBe(true);
		expect(reportTelemetryEnabled(false, undefined, {})).toBe(false);
		expect(reportTelemetryEnabled(true, { telemetry: false }, {})).toBe(false);
		expect(
			reportTelemetryEnabled(true, { report: { telemetry: false } }, {})
		).toBe(false);
		expect(reportTelemetryEnabled(true, undefined, { DO_NOT_TRACK: "1" })).toBe(
			false
		);
	});

	it("does not need a compiled key: the beacon has its own", () => {
		expect(reportTelemetryEnabled(true, { telemetry: true }, {})).toBe(true);
	});
});
