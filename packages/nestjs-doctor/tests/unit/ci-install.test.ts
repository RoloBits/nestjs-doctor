import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
	buildWorkflow,
	installCiWorkflow,
	resolveDefaultBranch,
} from "../../src/cli/ci-install.js";

// The suite runs from a husky pre-commit hook, and git exports GIT_DIR and
// friends to every hook. Inherited, they point these fixture repos at the
// outer repository, so `commit` lands in the wrong index.
const CLEAN_GIT_ENV = { ...process.env };
for (const name of [
	"GIT_DIR",
	"GIT_WORK_TREE",
	"GIT_INDEX_FILE",
	"GIT_OBJECT_DIRECTORY",
	"GIT_ALTERNATE_OBJECT_DIRECTORIES",
	"GIT_COMMON_DIR",
	"GIT_NAMESPACE",
	"GIT_PREFIX",
	"GIT_CEILING_DIRECTORIES",
]) {
	delete CLEAN_GIT_ENV[name];
}

const WORKFLOW_PATH = path.join(".github", "workflows", "nestjs-doctor.yml");

let tempRootDirectory: string;

const git = (cwd: string, ...args: string[]): void => {
	execFileSync("git", args, { cwd, env: CLEAN_GIT_ENV, stdio: "ignore" });
};

const makeDirectory = (name: string): string => {
	const directory = path.join(tempRootDirectory, name);
	fs.mkdirSync(directory, { recursive: true });
	return directory;
};

/** A repository with one commit, no remote refs unless the test adds them. */
const makeRepo = (name: string, branch: string): string => {
	const directory = makeDirectory(name);
	git(directory, "init", "-q", "-b", branch);
	git(directory, "config", "user.email", "test@example.com");
	git(directory, "config", "user.name", "Test");
	git(directory, "config", "commit.gpgsign", "false");
	git(directory, "commit", "-q", "--allow-empty", "-m", "init");
	return directory;
};

const withOriginHead = (directory: string, branch: string): string => {
	git(directory, "update-ref", `refs/remotes/origin/${branch}`, "HEAD");
	git(
		directory,
		"symbolic-ref",
		"refs/remotes/origin/HEAD",
		`refs/remotes/origin/${branch}`
	);
	return directory;
};

beforeAll(() => {
	tempRootDirectory = fs.mkdtempSync(
		path.join(os.tmpdir(), "nestjs-doctor-ci-install-test-")
	);
});

afterAll(() => {
	fs.rmSync(tempRootDirectory, { recursive: true, force: true });
});

describe("buildWorkflow", () => {
	it("pins the action and keeps the full history the merge base needs", () => {
		const workflow = buildWorkflow("main");

		expect(workflow).toContain("uses: RoloBits/nestjs-doctor@v1");
		expect(workflow).toContain("uses: actions/checkout@v4");
		expect(workflow).toContain("fetch-depth: 0");
	});

	it("requests only the permissions the action documents", () => {
		const workflow = buildWorkflow("main");

		expect(workflow).toContain("contents: read");
		expect(workflow).toContain("pull-requests: write");
		expect(workflow).toContain("statuses: write");
	});

	it("runs on pull requests and on pushes to the default branch", () => {
		const workflow = buildWorkflow("trunk");

		expect(workflow).toContain("pull_request:");
		expect(workflow).toContain('branches: ["trunk"]');
	});

	it("writes the input reference, every key commented out", () => {
		const workflow = buildWorkflow("main");
		const active = workflow
			.split("\n")
			.filter(
				(line) => line.includes("blocking:") && !line.trim().startsWith("#")
			);

		expect(workflow).toContain("#   blocking: error");
		expect(workflow).toContain("#   min-score:");
		expect(active).toEqual([]);
	});

	it("escapes a branch name that would otherwise break out of the YAML string", () => {
		const workflow = buildWorkflow('main","evil');

		expect(workflow).toContain('branches: ["main\\",\\"evil"]');
		expect(workflow).not.toContain('branches: ["main","evil"]');
	});
});

describe("resolveDefaultBranch", () => {
	it("reads the branch origin/HEAD points at", () => {
		const repo = withOriginHead(makeRepo("origin-head", "develop"), "develop");

		expect(resolveDefaultBranch(repo)).toBe("develop");
	});

	it("ignores an origin/HEAD pointing at a branch that no longer exists", () => {
		const repo = withOriginHead(makeRepo("stale-head", "gone"), "gone");
		git(repo, "update-ref", "-d", "refs/remotes/origin/gone");
		git(repo, "update-ref", "refs/remotes/origin/main", "HEAD");

		expect(resolveDefaultBranch(repo)).toBe("main");
	});

	it("falls back to origin/master when there is no origin/main", () => {
		const repo = makeRepo("master-remote", "master");
		git(repo, "update-ref", "refs/remotes/origin/master", "HEAD");

		expect(resolveDefaultBranch(repo)).toBe("master");
	});

	it("uses the checked out branch when the remote has no main or master", () => {
		const repo = makeRepo("trunk-only", "trunk");
		git(repo, "update-ref", "refs/remotes/origin/trunk", "HEAD");

		expect(resolveDefaultBranch(repo)).toBe("trunk");
	});

	it("falls back to main outside a repository", () => {
		const directory = makeDirectory("no-repo-branch");

		expect(resolveDefaultBranch(directory)).toBe("main");
	});
});

describe("installCiWorkflow", () => {
	it("writes the workflow at the repository root, not the working directory", async () => {
		const repo = withOriginHead(makeRepo("nested", "main"), "main");
		const nested = path.join(repo, "apps", "api");
		fs.mkdirSync(nested, { recursive: true });

		const result = await installCiWorkflow(nested, false);

		expect(result.status).toBe("created");
		// git reports the canonical root; on macOS /var resolves to /private/var.
		expect(result.workflowPath).toBe(
			path.join(fs.realpathSync(repo), WORKFLOW_PATH)
		);
		expect(result.branch).toBe("main");
	});

	it("refuses to write when there is no repository to write into", async () => {
		const directory = makeDirectory("no-repo");

		const result = await installCiWorkflow(directory, false);

		expect(result.status).toBe("no-repo");
		expect(fs.existsSync(path.join(directory, ".github"))).toBe(false);
	});

	it("leaves an existing workflow untouched", async () => {
		const repo = makeRepo("existing", "main");
		const workflowPath = path.join(repo, WORKFLOW_PATH);
		fs.mkdirSync(path.dirname(workflowPath), { recursive: true });
		fs.writeFileSync(workflowPath, "name: mine\n", "utf-8");

		const result = await installCiWorkflow(repo, false);

		expect(result.status).toBe("exists");
		expect(fs.readFileSync(workflowPath, "utf-8")).toBe("name: mine\n");
	});

	it("replaces an existing workflow when forced", async () => {
		const repo = makeRepo("forced", "main");
		const workflowPath = path.join(repo, WORKFLOW_PATH);
		fs.mkdirSync(path.dirname(workflowPath), { recursive: true });
		fs.writeFileSync(workflowPath, "name: mine\n", "utf-8");

		const result = await installCiWorkflow(repo, true);

		expect(result.status).toBe("created");
		expect(fs.readFileSync(workflowPath, "utf-8")).toContain(
			"uses: RoloBits/nestjs-doctor@v1"
		);
	});

	it("refuses to follow a symlink standing in for the workflow", async () => {
		const repo = makeRepo("symlink-file", "main");
		const outside = path.join(tempRootDirectory, "outside-target.txt");
		fs.writeFileSync(outside, "keep me\n", "utf-8");
		const workflowPath = path.join(repo, WORKFLOW_PATH);
		fs.mkdirSync(path.dirname(workflowPath), { recursive: true });
		fs.symlinkSync(outside, workflowPath);

		const result = await installCiWorkflow(repo, true);

		expect(result.status).toBe("symlink");
		expect(fs.readFileSync(outside, "utf-8")).toBe("keep me\n");
	});

	it("refuses a dangling symlink, which no exists check would catch", async () => {
		const repo = makeRepo("symlink-dangling", "main");
		const missing = path.join(tempRootDirectory, "not-created-yet.txt");
		const workflowPath = path.join(repo, WORKFLOW_PATH);
		fs.mkdirSync(path.dirname(workflowPath), { recursive: true });
		fs.symlinkSync(missing, workflowPath);

		const result = await installCiWorkflow(repo, false);

		expect(result.status).toBe("symlink");
		expect(fs.existsSync(missing)).toBe(false);
	});

	it("refuses when .github itself is a symlink out of the repository", async () => {
		const repo = makeRepo("symlink-dir", "main");
		const outside = makeDirectory("outside-github");
		fs.symlinkSync(outside, path.join(repo, ".github"));

		const result = await installCiWorkflow(repo, false);

		expect(result.status).toBe("symlink");
		expect(fs.existsSync(path.join(outside, "workflows"))).toBe(false);
	});

	it("reports the errno instead of throwing when the path is not writable", async () => {
		const repo = makeRepo("unwritable", "main");
		fs.writeFileSync(path.join(repo, ".github"), "not a directory", "utf-8");

		const result = await installCiWorkflow(repo, false);

		expect(result.status).toBe("failed");
		expect(result.reason).toBe("ENOTDIR");
	});
});
