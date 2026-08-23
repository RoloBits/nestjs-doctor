import { spawn } from "node:child_process";
import { isCancel, log, select } from "@clack/prompts";
import type { Diagnostic } from "../../common/diagnostic.js";
import { isCommandAvailable } from "../ui/commands.js";
import { copyToClipboard } from "./clipboard.js";
import { buildFixPrompt, groupFindings } from "./detail.js";

interface LaunchableAgent {
	binary: string;
	name: string;
}

const KNOWN_AGENTS: LaunchableAgent[] = [
	{ binary: "claude", name: "Claude Code" },
	{ binary: "codex", name: "Codex" },
	{ binary: "cursor-agent", name: "Cursor" },
];

/**
 * Agents the menu can start. Windows only gets the prompt copied: spawning a
 * `.cmd` shim needs a shell, and cmd quoting mangles a multi-line prompt.
 */
const detectLaunchableAgents = (): LaunchableAgent[] => {
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

const launchAgent = (
	agent: LaunchableAgent,
	prompt: string,
	cwd: string
): Promise<void> => {
	return new Promise((resolvePromise) => {
		const child = spawn(agent.binary, [prompt], {
			cwd,
			stdio: "inherit",
		});
		child.on("error", (error) => {
			log.error(`Could not start ${agent.name}: ${error.message}`);
			resolvePromise();
		});
		child.on("close", () => resolvePromise());
	});
};

/** The handoff picker: launch a detected agent, or copy the prompt. */
export const handOffToAgent = async (
	diagnostics: Diagnostic[],
	targetPath: string
): Promise<void> => {
	const agents = detectLaunchableAgents();
	const prompt = buildHandoffPrompt(diagnostics, targetPath);

	const choice = await select<LaunchableAgent | "copy" | "back">({
		message: "Hand off to",
		options: [
			...agents.map((agent) => ({
				hint: `Start ${agent.binary} here with the findings as the prompt`,
				label: agent.name,
				value: agent,
			})),
			{
				hint: "Paste into any agent or edit it first",
				label: "Copy the prompt",
				value: "copy" as const,
			},
			{ label: "Back", value: "back" as const },
		],
	});

	if (isCancel(choice) || choice === "back") {
		return;
	}

	if (choice === "copy") {
		if (await copyToClipboard(prompt)) {
			log.success("Prompt copied. Paste it into any agent.");
		} else {
			log.warn("No clipboard tool found; printing instead.");
			process.stdout.write(`\n${prompt}\n\n`);
		}
		return;
	}

	log.info(`Starting ${choice.name}. Quit it to come back to the menu.`);
	await launchAgent(choice, prompt, targetPath);
};
