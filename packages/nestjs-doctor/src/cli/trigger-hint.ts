import { createHash } from "node:crypto";
import { existsSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { findGitRepo } from "../engine/git.js";
import { detectTrigger } from "../telemetry/environment.js";
import { ciWorkflowExists } from "./ci-install.js";
import { isNonInteractiveEnvironment } from "./ui/environment.js";

/** The recurring trigger a one-shot terminal run is offered. */
export type TriggerOffer = "action" | "hook" | "skill";

const TRIGGER_HINT_LINES: Record<TriggerOffer, string> = {
	action:
		"Review every pull request with it: npx nestjs-doctor@latest ci install",
	hook: "Rescan on every commit: add `npx nestjs-doctor@latest --staged` to your pre-commit hook",
	skill:
		"Rescan after every agent edit: npx nestjs-doctor@latest --init installs the skill",
};

export const triggerHintLine = (offer: TriggerOffer): string =>
	TRIGGER_HINT_LINES[offer];

const BACKSLASH = /\\/g;

/** The hints store key for one project: a hash of its path, kept local and never sent. */
export const triggerHintKey = (targetPath: string): string => {
	let root = targetPath;
	try {
		root = realpathSync(targetPath);
	} catch {
		// Hash the path as given.
	}
	root = root.replace(BACKSLASH, "/").toLowerCase();
	return `trigger:${createHash("sha256").update(root).digest("hex").slice(0, 16)}`;
};

/** Picks the trigger the repository is closest to already having. */
export const chooseTriggerOffer = (targetPath: string): TriggerOffer => {
	const repo = findGitRepo(targetPath);
	if (repo) {
		if (
			existsSync(join(repo.root, ".github", "workflows")) &&
			!ciWorkflowExists(targetPath)
		) {
			return "action";
		}
		if (
			existsSync(join(repo.root, ".husky")) ||
			existsSync(join(repo.root, "lefthook.yml"))
		) {
			return "hook";
		}
	}
	return "skill";
};

/** Where the once-per-project trigger line prints, if anywhere. Only a one-shot
 * terminal run (npx, global, script) that has not seen it for this project. */
export const triggerHintSite = (input: {
	env?: NodeJS.ProcessEnv;
	hints: Record<string, string>;
	interactive: boolean;
	isMachineReadable: boolean;
	targetPath: string;
	tty: boolean;
}): "menu" | "none" | "run" => {
	const env = input.env ?? process.env;
	const trigger = detectTrigger(env);
	if (
		input.isMachineReadable ||
		!input.tty ||
		isNonInteractiveEnvironment(env) ||
		(trigger !== "npx" && trigger !== "global" && trigger !== "script") ||
		input.hints[triggerHintKey(input.targetPath)]
	) {
		return "none";
	}
	return input.interactive ? "menu" : "run";
};
