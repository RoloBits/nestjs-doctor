import { intro, isCancel, log, outro, select, spinner } from "@clack/prompts";
import type { DiagnoseResult } from "../../common/result.js";
import { withSurface } from "../../engine/result-builder.js";
import { buildMarkdownReport } from "../../formatters/markdown-report.js";
import { openReportInBrowser, writeReportFile } from "../../report/output.js";
import { ciWorkflowExists, installCiWorkflow } from "../ci-install.js";
import { copyToClipboard } from "./clipboard.js";
import { reviewFindings } from "./detail.js";
import { handOffToAgent } from "./handoff.js";

interface InteractiveContext {
	buildReportHtml: () => string;
	result: DiagnoseResult;
	targetPath: string;
	version: string;
}

type MenuAction = "review" | "report" | "ci" | "handoff" | "markdown" | "quit";

const openReport = async (context: InteractiveContext): Promise<void> => {
	const working = spinner();
	working.start("Generating the HTML report");
	let reportPath: string;
	try {
		const html = context.buildReportHtml();
		reportPath = await writeReportFile(context.targetPath, html);
	} catch (error) {
		working.stop("Report generation failed");
		log.error(error instanceof Error ? error.message : String(error));
		return;
	}
	working.stop(`Report written to ${reportPath}`);
	openReportInBrowser(reportPath, log.warn);
	log.info("Opened in your browser.");
};

const addCiWorkflow = async (context: InteractiveContext): Promise<void> => {
	const outcome = await installCiWorkflow(context.targetPath, false);
	switch (outcome.status) {
		case "created":
			log.success(
				`Workflow written to ${outcome.workflowPath}. Push trigger keyed to the ${outcome.branch} branch.`
			);
			log.info(
				"The check never fails until you set blocking or min-score in the workflow."
			);
			break;
		case "exists":
			log.info(
				`${outcome.workflowPath} already exists. Run "nestjs-doctor ci install --force" to replace it.`
			);
			break;
		case "no-repo":
			log.warn("Not a git repository; nothing was written.");
			break;
		case "symlink":
			log.warn(
				`${outcome.workflowPath} is a symlink; refusing to write through it.`
			);
			break;
		default:
			log.error(`Could not write the workflow (${outcome.status}).`);
	}
};

const copyMarkdown = async (context: InteractiveContext): Promise<void> => {
	const markdown = buildMarkdownReport(context.result, {
		targetPath: context.targetPath,
		version: context.version,
	});
	if (await copyToClipboard(markdown)) {
		log.success("Markdown summary copied to the clipboard.");
		return;
	}
	log.warn("No clipboard tool found; printing instead.");
	process.stdout.write(`\n${markdown}\n\n`);
};

/** The post-scan menu. Never changes process.exitCode: the gates own it. */
export const runInteractiveMenu = async (
	context: InteractiveContext
): Promise<void> => {
	intro("nestjs-doctor");

	// What the console report showed. The markdown copy narrows itself.
	const shown = withSurface(context.result, "cli");
	const findingCount = shown.summary.total;

	for (;;) {
		const offerCi = !ciWorkflowExists(context.targetPath);

		const choice = await select<MenuAction>({
			message: "What next?",
			options: [
				...(findingCount > 0
					? [
							{
								hint: "Finding by finding, with the code",
								label: `Review ${findingCount} finding${findingCount === 1 ? "" : "s"}`,
								value: "review" as const,
							},
						]
					: []),
				{
					hint: `${findingCount} finding${findingCount === 1 ? "" : "s"} in an interactive page`,
					label: "Open the HTML report",
					value: "report",
				},
				...(offerCi
					? [
							{
								hint: "Scaffold .github/workflows/nestjs-doctor.yml",
								label: "Add to GitHub Actions",
								value: "ci" as const,
							},
						]
					: []),
				...(findingCount > 0
					? [
							{
								hint: "Start an agent with the findings, or copy the prompt",
								label: "Hand off to an agent",
								value: "handoff" as const,
							},
						]
					: []),
				{
					hint: "The pull request summary, for pasting anywhere",
					label: "Copy findings as markdown",
					value: "markdown",
				},
				{ label: "Quit", value: "quit" },
			],
		});

		if (isCancel(choice) || choice === "quit") {
			outro("Done.");
			return;
		}

		if (choice === "review") {
			await reviewFindings(shown.diagnostics, context.targetPath);
		} else if (choice === "report") {
			await openReport(context);
		} else if (choice === "ci") {
			await addCiWorkflow(context);
		} else if (choice === "handoff") {
			await handOffToAgent(shown.diagnostics, context.targetPath);
		} else if (choice === "markdown") {
			await copyMarkdown(context);
		}
	}
};
