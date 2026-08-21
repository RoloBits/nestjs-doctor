import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { findGitRepo, runGit } from "../engine/git.js";
import { logger } from "./ui/logger.js";

const ORIGIN_HEAD_RE = /^origin\/(.+)$/;
const WORKFLOW_FILE = join(".github", "workflows", "nestjs-doctor.yml");

interface CiInstallResult {
	status: "created" | "exists" | "failed";
	workflowPath: string;
}

/** Branch the repository's `origin` points at, or `main` when git can't say. */
export const resolveDefaultBranch = (root: string): string => {
	const head = runGit(root, [
		"symbolic-ref",
		"--short",
		"refs/remotes/origin/HEAD",
	]);
	const match = head?.trim().match(ORIGIN_HEAD_RE);
	if (match) {
		return match[1];
	}
	for (const branch of ["main", "master"]) {
		if (
			runGit(root, ["rev-parse", "--verify", "--quiet", `origin/${branch}`])
		) {
			return branch;
		}
	}
	return "main";
};

export const buildWorkflow = (
	defaultBranch: string
): string => `# nestjs-doctor — health score, diagnostics, and pull request review for NestJS.
#
# Docs:   https://nestjs.doctor/docs/ci
# Source: https://github.com/RoloBits/nestjs-doctor

name: nestjs-doctor

on:
  # Reviews the pull request and reports only what the change introduced.
  pull_request:
    types: [opened, synchronize, reopened, ready_for_review]
  # Scans ${defaultBranch} on every push, so the score keeps a trend line.
  push:
    branches: ["${defaultBranch}"]

permissions:
  contents: read
  pull-requests: write
  statuses: write

# A new commit cancels the run still in flight, so the comment matches the head.
concurrency:
  group: nestjs-doctor-\${{ github.event.pull_request.number || github.ref }}
  cancel-in-progress: true

jobs:
  scan:
    runs-on: ubuntu-latest
    steps:
      # fetch-depth: 0 gives the scan the history it needs to find the merge base.
      # A shallow checkout has none, so a pull request falls back to reporting every
      # finding in the changed files instead of only the ones it introduced.
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - uses: RoloBits/nestjs-doctor@v1
        # Advisory by default: the action comments and publishes a commit status,
        # and never fails the check. Uncomment a key below to change that.
        # with:
        #   blocking: error           # Fail on: none (default), warning, error
        #   min-score: "80"           # Fail when the whole-project score drops below this
        #   scope: files              # Pull request scope: changed (default), files, lines, full
        #   directory: apps/api       # Scan a sub-directory (default: ".")
        #   comment: "false"          # Turn off the sticky summary comment
        #   review-comments: "false"  # Turn off inline comments on the changed lines
        #   commit-status: "false"    # Turn off the commit status
        #   sarif: "true"             # Also write SARIF for GitHub code scanning
        #   version: "1.2.3"          # Pin the nestjs-doctor version (default: latest)
`;

const writeWorkflow = async (
	workflowPath: string,
	content: string
): Promise<boolean> => {
	try {
		await mkdir(dirname(workflowPath), { recursive: true });
		await writeFile(workflowPath, content, "utf-8");
		return true;
	} catch {
		return false;
	}
};

/** Writes the pull request workflow into the repository that contains `targetPath`. */
export const installCiWorkflow = async (
	targetPath: string,
	force: boolean
): Promise<CiInstallResult> => {
	const repo = findGitRepo(targetPath);
	const root = repo?.root ?? targetPath;
	const workflowPath = join(root, WORKFLOW_FILE);

	if (existsSync(workflowPath) && !force) {
		return { status: "exists", workflowPath };
	}

	const content = buildWorkflow(resolveDefaultBranch(root));
	const written = await writeWorkflow(workflowPath, content);
	return { status: written ? "created" : "failed", workflowPath };
};

export const runCiInstall = async (
	targetPath: string,
	force: boolean
): Promise<number> => {
	const { status, workflowPath } = await installCiWorkflow(targetPath, force);
	const fromCwd = relative(process.cwd(), workflowPath);
	// An empty or upward path means the file sits outside cwd; show it in full.
	const shown = fromCwd && !fromCwd.startsWith("..") ? fromCwd : workflowPath;

	if (status === "failed") {
		logger.error(`Could not write ${shown}`);
		return 1;
	}

	if (status === "exists") {
		logger.warn(`${shown} already exists — left untouched.`);
		logger.dim("Run with --force to replace it.");
		return 0;
	}

	logger.success(`Created ${shown}`);
	logger.break();
	logger.dim(
		"Commit it and open a pull request. nestjs-doctor comments on what the change introduced,"
	);
	logger.dim(
		"and never fails the check until you set blocking or min-score in the workflow."
	);
	return 0;
};
