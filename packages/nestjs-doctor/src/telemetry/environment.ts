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

/**
 * The env vars the official GitHub Action sets. Nothing else writes them.
 * A test asserts `action.yml` still writes every one, because a renamed input
 * would otherwise resolve to an empty string and report as "off" forever.
 */
export const ACTION_ENV = {
	actorAssociation: "NESTJS_DOCTOR_ACTION_ACTOR_ASSOCIATION",
	commitStatus: "NESTJS_DOCTOR_ACTION_COMMIT_STATUS",
	comment: "NESTJS_DOCTOR_ACTION_COMMENT",
	marker: "NESTJS_DOCTOR_GITHUB_ACTION",
	resolved: "NESTJS_DOCTOR_ACTION_RESOLVED",
	reviewComments: "NESTJS_DOCTOR_ACTION_REVIEW_COMMENTS",
	sarif: "NESTJS_DOCTOR_ACTION_SARIF",
	version: "NESTJS_DOCTOR_ACTION_VERSION",
} as const;

/** What the action writes when `github.action_ref` is empty. */
const NO_REF = "1";

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

/** A release tag, reduced to its major. A branch name is never reported. */
const VERSION_TAG_RE = /^v(\d{1,3})(?:[.\w-]*)$/;
const COMMIT_SHA_RE = /^[0-9a-f]{40}$/i;

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
	viaAction: boolean;
}

/** Tri-state: the action writes "true"/"false", and absent stays absent. */
const readBoolean = (value: string | undefined): boolean | null =>
	value === "true" || value === "false" ? value === "true" : null;

const oneOf = (
	allowed: readonly string[],
	value: string | undefined
): string | null => (value && allowed.includes(value) ? value : null);

/**
 * Which major of the action this is, `sha` for a pinned commit, `branch` for
 * anything else. A ref is the only free-form value the action can hand us, and
 * a fork's branch name has no bound, so it is classified rather than reported.
 */
const classifyActionRef = (marker: string | undefined): string | null => {
	if (!marker || marker === NO_REF) {
		return null;
	}
	const tag = VERSION_TAG_RE.exec(marker);
	if (tag) {
		return `v${tag[1]}`;
	}
	return COMMIT_SHA_RE.test(marker) ? "sha" : "branch";
};

/**
 * Classifies the action's `version` input. `resolved` is the action's own
 * verdict — it publishes the literal "local" for a path or `file:` spec, which
 * is the same check the install made, so the two cannot disagree.
 */
const classifyVersionPin = (
	version: string | undefined,
	resolved: string | undefined
): VersionPin | null => {
	if (resolved?.trim() === "local") {
		return "local";
	}
	const requested = version?.trim();
	if (requested === undefined) {
		return null;
	}
	// The action defaults the input to "latest", and an empty one means the same.
	return requested === "" || requested === "latest" ? "latest" : "pinned";
};

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
		actionComment: readBoolean(env[ACTION_ENV.comment]),
		actionCommitStatus: readBoolean(env[ACTION_ENV.commitStatus]),
		actionRef: classifyActionRef(marker?.trim()),
		actionReviewComments: readBoolean(env[ACTION_ENV.reviewComments]),
		actionSarif: readBoolean(env[ACTION_ENV.sarif]),
		actionVersionPin: classifyVersionPin(
			env[ACTION_ENV.version],
			env[ACTION_ENV.resolved]
		),
		actorAssociation: oneOf(
			ACTOR_ASSOCIATIONS,
			env[ACTION_ENV.actorAssociation]?.trim()
		),
		ciEvent: eventName ? (oneOf(CI_EVENTS, eventName) ?? "other") : null,
		ciProvider: detectCiProvider(env),
		viaAction: isSet(marker),
	};
}
