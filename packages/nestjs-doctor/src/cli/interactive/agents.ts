import { spawn } from "node:child_process";
import type { Diagnostic } from "../../common/diagnostic.js";
import { logger } from "../../ui/logger.js";
import { isCommandAvailable } from "../ui/commands.js";
import { buildFixPrompt, groupFindings } from "./findings.js";

export interface LaunchableAgent {
	binary: string;
	name: string;
}

const KNOWN_AGENTS: LaunchableAgent[] = [
	{ binary: "claude", name: "Claude Code" },
	{ binary: "codex", name: "Codex" },
	{ binary: "cursor-agent", name: "Cursor" },
];

/** Agents the menu can start. Windows only gets the prompt copied. */
export const detectLaunchableAgents = (): LaunchableAgent[] => {
	if (process.platform === "win32") {
		return [];
	}
	return KNOWN_AGENTS.filter((agent) => isCommandAvailable(agent.binary));
};

/** The top rule groups plus standing orders, for any agent's first message. */
export const buildHandoffPrompt = (
	diagnostics: Diagnostic[],
	targetPath: string
): string => {
	const groups = groupFindings(diagnostics);
	const top = groups.slice(0, 3);

	const sections = top.map((group) => buildFixPrompt(group, targetPath));
	const remaining = groups.length - top.length;
	const tail =
		remaining > 0
			? `\n\n${remaining} more rule${remaining === 1 ? "" : "s"} reported; run npx nestjs-doctor@latest . --json for everything.`
			: "";

	return [
		`nestjs-doctor scanned ${targetPath} and reported findings for ${groups.length} rule${groups.length === 1 ? "" : "s"}. Work through them one rule at a time, worst first.`,
		"",
		sections.join("\n\n---\n\n"),
		tail,
	].join("\n");
};

export const launchAgent = (
	agent: LaunchableAgent,
	prompt: string,
	cwd: string
): Promise<void> =>
	new Promise((resolvePromise) => {
		const child = spawn(agent.binary, [prompt], {
			cwd,
			stdio: "inherit",
		});
		child.on("error", (error) => {
			logger.error(`Could not start ${agent.name}: ${error.message}`);
			resolvePromise();
		});
		child.on("close", () => resolvePromise());
	});
