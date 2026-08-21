import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import {
	buildWorkflow,
	installCiWorkflow,
	resolveDefaultBranch,
} from "../../src/cli/ci-install.js";

const tempRootDirectory = fs.mkdtempSync(
	path.join(os.tmpdir(), "nestjs-doctor-ci-install-test-")
);

const WORKFLOW_PATH = path.join(".github", "workflows", "nestjs-doctor.yml");

const makeDirectory = (name: string): string => {
	const directory = path.join(tempRootDirectory, name);
	fs.mkdirSync(directory, { recursive: true });
	return directory;
};

const git = (cwd: string, ...args: string[]): void => {
	execFileSync("git", args, { cwd, stdio: "ignore" });
};

const makeRepo = (name: string, defaultBranch: string): string => {
	const directory = makeDirectory(name);
	git(directory, "init", "-q", "-b", defaultBranch);
	git(directory, "commit", "-q", "--allow-empty", "-m", "init");
	git(directory, "update-ref", `refs/remotes/origin/${defaultBranch}`, "HEAD");
	git(
		directory,
		"symbolic-ref",
		"refs/remotes/origin/HEAD",
		`refs/remotes/origin/${defaultBranch}`
	);
	return directory;
};

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

	it("leaves every input commented out, so the check stays advisory", () => {
		const workflow = buildWorkflow("main");
		const uncommented = workflow
			.split("\n")
			.filter(
				(line) => line.includes("blocking:") && !line.trim().startsWith("#")
			);

		expect(uncommented).toEqual([]);
	});
});

describe("resolveDefaultBranch", () => {
	it("reads the branch origin/HEAD points at", () => {
		const repo = makeRepo("origin-head", "develop");

		expect(resolveDefaultBranch(repo)).toBe("develop");
	});

	it("falls back to main outside a repository", () => {
		const directory = makeDirectory("no-repo");

		expect(resolveDefaultBranch(directory)).toBe("main");
	});
});

describe("installCiWorkflow", () => {
	it("writes the workflow at the repository root, not the working directory", async () => {
		const repo = makeRepo("nested", "main");
		const nested = path.join(repo, "apps", "api");
		fs.mkdirSync(nested, { recursive: true });

		const result = await installCiWorkflow(nested, false);

		expect(result.status).toBe("created");
		// git reports the canonical root; on macOS /var resolves to /private/var.
		expect(result.workflowPath).toBe(
			path.join(fs.realpathSync(repo), WORKFLOW_PATH)
		);
		expect(fs.existsSync(result.workflowPath)).toBe(true);
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

	it("reports failure instead of throwing when the path is not writable", async () => {
		const directory = makeDirectory("unwritable");
		fs.writeFileSync(
			path.join(directory, ".github"),
			"not a directory",
			"utf-8"
		);

		const result = await installCiWorkflow(directory, false);

		expect(result.status).toBe("failed");
	});
});
