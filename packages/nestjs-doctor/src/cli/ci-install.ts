import { lstatSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { findGitRepo, runGit } from "../engine/git.js";
import { logger } from "./ui/logger.js";

const ORIGIN_HEAD_RE = /^origin\/(.+)$/;
const WORKFLOW_FILE = join(".github", "workflows", "nestjs-doctor.yml");

type InstallStatus = "created" | "exists" | "failed" | "no-repo" | "symlink";

interface CiInstallResult {
	branch?: string;
	reason?: string;
	status: InstallStatus;
	workflowPath: string;
}

const refExists = (root: string, ref: string): boolean =>
	runGit(root, ["rev-parse", "--verify", "--quiet", `${ref}^{commit}`]) !==
	null;

const shortRef = (root: string, ref: string): string | undefined =>
	runGit(root, ["symbolic-ref", "--quiet", "--short", ref])?.trim() ||
	undefined;

/** Branch the workflow's push trigger is keyed to. Every candidate is verified. */
export const resolveDefaultBranch = (root: string): string => {
	const named = shortRef(root, "refs/remotes/origin/HEAD")?.match(
		ORIGIN_HEAD_RE
	)?.[1];
	if (named && refExists(root, `origin/${named}`)) {
		return named;
	}
	for (const branch of ["main", "master"]) {
		if (refExists(root, `origin/${branch}`)) {
			return branch;
		}
	}
	return shortRef(root, "HEAD") ?? "main";
};

/** Path of the first symlink on the way to the workflow, or null when there is none. */
const findSymlink = (root: string): string | null => {
	const segments = [".github", join(".github", "workflows"), WORKFLOW_FILE];
	for (const segment of segments) {
		const candidate = join(root, segment);
		try {
			if (lstatSync(candidate).isSymbolicLink()) {
				return candidate;
			}
		} catch {
			// Missing segments are created below.
		}
	}
	return null;
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
  # Scans the default branch on every push, so the score keeps a trend line.
  push:
    branches: [${JSON.stringify(defaultBranch)}]

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
        # Every input: https://nestjs.doctor/docs/ci
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

/** Writes the pull request workflow into the repository that contains `targetPath`. */
export const installCiWorkflow = async (
	targetPath: string,
	force: boolean
): Promise<CiInstallResult> => {
	const repo = findGitRepo(targetPath);
	if (!repo) {
		return { status: "no-repo", workflowPath: join(targetPath, WORKFLOW_FILE) };
	}

	const symlink = findSymlink(repo.root);
	if (symlink) {
		return { status: "symlink", workflowPath: symlink };
	}

	const workflowPath = join(repo.root, WORKFLOW_FILE);
	const branch = resolveDefaultBranch(repo.root);
	try {
		await mkdir(dirname(workflowPath), { recursive: true });
		await writeFile(workflowPath, buildWorkflow(branch), {
			encoding: "utf-8",
			flag: force ? "w" : "wx",
		});
		return { branch, status: "created", workflowPath };
	} catch (error) {
		const code = (error as NodeJS.ErrnoException).code;
		if (code === "EEXIST") {
			return { status: "exists", workflowPath };
		}
		return { reason: code ?? "unknown", status: "failed", workflowPath };
	}
};

const display = (workflowPath: string): string => {
	const fromCwd = relative(process.cwd(), workflowPath);
	// An empty or upward path means the file sits outside cwd; show it in full.
	return fromCwd && !fromCwd.startsWith("..") ? fromCwd : workflowPath;
};

export const runCiInstall = async (
	targetPath: string,
	force: boolean
): Promise<number> => {
	const result = await installCiWorkflow(targetPath, force);
	const shown = display(result.workflowPath);

	if (result.status === "no-repo") {
		logger.error(
			"Not a git repository, so there is no repository root to write to."
		);
		logger.dim("Run this from your project, or `git init` first.");
		return 2;
	}

	if (result.status === "symlink") {
		logger.error(`Refusing to write through a symlink: ${shown}`);
		logger.dim(
			"Replace it with a real directory or file, then run this again."
		);
		return 2;
	}

	if (result.status === "failed") {
		logger.error(`Could not write ${shown} (${result.reason})`);
		return 1;
	}

	if (result.status === "exists") {
		logger.warn(`${shown} already exists — left untouched.`);
		logger.dim("Run with --force to replace it.");
		return 0;
	}

	logger.success(`Created ${shown}`);
	logger.dim(`Push trigger keyed to the ${result.branch} branch.`);
	logger.break();
	logger.dim(
		"Commit it and open a pull request. nestjs-doctor comments on what the change introduced,"
	);
	logger.dim(
		"and never fails the check until you set blocking or min-score in the workflow."
	);
	return 0;
};
