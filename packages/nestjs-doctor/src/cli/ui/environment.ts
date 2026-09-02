import { AGENT_ENV_VARS } from "../../telemetry/environment.js";

const CI_ENV_VARS = [
	"CI",
	"GITHUB_ACTIONS",
	"GITLAB_CI",
	"BUILDKITE",
	"JENKINS_URL",
	"TF_BUILD",
	"CODEBUILD_BUILD_ID",
	"TEAMCITY_VERSION",
	"BITBUCKET_BUILD_NUMBER",
	"CIRCLECI",
	"TRAVIS",
	"DRONE",
];

/** True in CI or inside a coding agent, where a prompt would hang the run. */
export const isNonInteractiveEnvironment = (
	env: NodeJS.ProcessEnv = process.env
): boolean => [...CI_ENV_VARS, ...AGENT_ENV_VARS].some((name) => env[name]);

interface PromptGate {
	format: string;
	score: boolean;
}

interface PromptStreams {
	stdin: { isTTY?: boolean; setRawMode?: unknown };
	stdout: { isTTY?: boolean };
}

/** Whether the run may show the post-scan menu. */
export const canPrompt = (
	options: PromptGate,
	env: NodeJS.ProcessEnv = process.env,
	streams: PromptStreams = process
): boolean => {
	if (options.format !== "console" || options.score) {
		return false;
	}
	if (!(streams.stdin.isTTY && streams.stdout.isTTY)) {
		return false;
	}
	if (typeof streams.stdin.setRawMode !== "function") {
		return false;
	}
	if (env.TERM === "dumb") {
		return false;
	}
	return !isNonInteractiveEnvironment(env);
};
