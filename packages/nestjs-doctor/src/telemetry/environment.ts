/** Any value other than the shell's own "off" spellings counts as set. */
export const isSet = (value: string | undefined): boolean =>
	value !== undefined && value !== "" && value !== "0" && value !== "false";

/** Where the scan ran. A report stamps this at generation time. */
export function generatedIn(
	env: NodeJS.ProcessEnv = process.env
): "ci" | "cli" {
	return isSet(env.CI) || isSet(env.GITHUB_ACTIONS) ? "ci" : "cli";
}

/** The CI systems worth naming. Read through `detectCiProvider`. */
const CI_PROVIDERS: readonly (readonly [string, string])[] = [
	["GITHUB_ACTIONS", "github"],
	["GITLAB_CI", "gitlab"],
	["CIRCLECI", "circle"],
	["TRAVIS", "travis"],
	["BUILDKITE", "buildkite"],
	["JENKINS_URL", "jenkins"],
];

/** Which CI this is, or `unknown` on a runner that only sets `CI`. */
export function detectCiProvider(
	env: NodeJS.ProcessEnv = process.env
): string | null {
	const provider = CI_PROVIDERS.find(([name]) => isSet(env[name]));
	if (provider) {
		return provider[1];
	}
	return isSet(env.CI) ? "unknown" : null;
}

/** The env vars the official GitHub Action sets. Nothing else writes them. */
const ACTION_ENV = {
	actorAssociation: "NESTJS_DOCTOR_ACTION_ACTOR_ASSOCIATION",
	commitStatus: "NESTJS_DOCTOR_ACTION_COMMIT_STATUS",
	comment: "NESTJS_DOCTOR_ACTION_COMMENT",
	marker: "NESTJS_DOCTOR_GITHUB_ACTION",
	reviewComments: "NESTJS_DOCTOR_ACTION_REVIEW_COMMENTS",
	sarif: "NESTJS_DOCTOR_ACTION_SARIF",
	version: "NESTJS_DOCTOR_ACTION_VERSION",
} as const;

/** The workflow triggers a scan plausibly runs on. Anything else is `other`. */
const CI_EVENTS: readonly string[] = [
	"merge_group",
	"pull_request",
	"pull_request_target",
	"push",
	"release",
	"schedule",
	"workflow_call",
	"workflow_dispatch",
];

/** GitHub's own vocabulary for a pull request author's tie to the repository. */
const ACTOR_ASSOCIATIONS: readonly string[] = [
	"COLLABORATOR",
	"CONTRIBUTOR",
	"FIRST_TIMER",
	"FIRST_TIME_CONTRIBUTOR",
	"MANNEQUIN",
	"MEMBER",
	"NONE",
	"OWNER",
];

const RUNNER_OPERATING_SYSTEMS: readonly string[] = [
	"Linux",
	"Windows",
	"macOS",
];

/**
 * A ref names a tag, a branch, or a commit. Git forbids `..` and a leading
 * slash in one, so a path that reaches those is not a ref and is dropped.
 */
const ACTION_REF_RE = /^(?!\/)(?!.*\.\.)[\w.\-/]{1,64}$/;

/** A relative path, an absolute one, or a `file:` spec — all local checkouts. */
const LOCAL_SPEC_RE = /^(?:file:|\.{0,2}\/)/;

/** How the action's `version` input pins the CLI. The spec itself never travels. */
export type VersionPin = "latest" | "local" | "pinned";

export interface ActionFacts {
	actionComment: boolean | null;
	actionCommitStatus: boolean | null;
	actionRef: string | null;
	actionReviewComments: boolean | null;
	actionSarif: boolean | null;
	actionVersionPin: VersionPin | null;
	actorAssociation: string | null;
	ciEvent: string | null;
	ciProvider: string | null;
	runnerOs: string | null;
	viaAction: boolean;
}

/** Tri-state: the action writes "true"/"false", and absent stays absent. */
const readBoolean = (value: string | undefined): boolean | null => {
	if (value === "true") {
		return true;
	}
	if (value === "false") {
		return false;
	}
	return null;
};

const oneOf = (
	allowed: readonly string[],
	value: string | undefined
): string | null => (value && allowed.includes(value) ? value : null);

/**
 * Classifies the action's `version` input. A local path or a tarball URL is a
 * filesystem path or a host, so only the classification travels.
 */
function classifyVersionPin(value: string | undefined): VersionPin | null {
	const spec = value?.trim();
	if (!spec) {
		return null;
	}
	if (spec === "latest") {
		return "latest";
	}
	if (LOCAL_SPEC_RE.test(spec)) {
		return "local";
	}
	return "pinned";
}

/**
 * What the run's environment says about how it was triggered. Every field is a
 * bool or a value from a fixed list; an unrecognised one is dropped rather than
 * forwarded, so no env var can put an unbounded string in the payload.
 */
export function actionContext(
	env: NodeJS.ProcessEnv = process.env
): ActionFacts {
	const marker = env[ACTION_ENV.marker];
	const eventName = env.GITHUB_EVENT_NAME?.trim();

	return {
		actionCommitStatus: readBoolean(env[ACTION_ENV.commitStatus]),
		actionComment: readBoolean(env[ACTION_ENV.comment]),
		actionRef:
			marker && ACTION_REF_RE.test(marker) && marker !== "1" ? marker : null,
		actionReviewComments: readBoolean(env[ACTION_ENV.reviewComments]),
		actionSarif: readBoolean(env[ACTION_ENV.sarif]),
		actionVersionPin: classifyVersionPin(env[ACTION_ENV.version]),
		actorAssociation: oneOf(
			ACTOR_ASSOCIATIONS,
			env[ACTION_ENV.actorAssociation]?.trim()
		),
		ciEvent: eventName ? (oneOf(CI_EVENTS, eventName) ?? "other") : null,
		ciProvider: detectCiProvider(env),
		runnerOs: oneOf(RUNNER_OPERATING_SYSTEMS, env.RUNNER_OS?.trim()),
		viaAction: isSet(marker),
	};
}
