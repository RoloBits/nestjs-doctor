import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Diagnostic } from "../../src/common/diagnostic.js";
import { computeBaselineDelta } from "../../src/engine/baseline.js";
import {
	buildAnalysisContext,
	diagnose,
	resolveScanConfig,
} from "../../src/engine/scanner.js";
import { applyScope, resolveScope } from "../../src/engine/scope.js";

const PATH_SEPARATOR_RE = /[/\\]/;

// The suite runs from a husky pre-commit hook, and git exports GIT_DIR and
// friends to every hook. Inherited, they point these fixture repos at the outer
// repository, so `add` and `commit` land in the wrong index.
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

const git = (cwd: string, ...args: string[]): void => {
	execFileSync("git", args, { cwd, env: CLEAN_GIT_ENV, stdio: "ignore" });
};

const service = (name: string, body: string): string =>
	`import { Injectable } from "@nestjs/common";
import { readFileSync } from "node:fs";

@Injectable()
export class ${name} {
${body}
}
`;

const scanHead = async (targetPath: string) => {
	const scanConfig = await resolveScanConfig(targetPath);
	const context = await buildAnalysisContext(targetPath, scanConfig);
	return { diagnostics: diagnose(context).diagnostics, scanConfig };
};

const rulesIn = (diagnostics: Diagnostic[]): string[] =>
	[
		...new Set(
			diagnostics.map((d) => d.filePath.split(PATH_SEPARATOR_RE).pop())
		),
	].sort();

describe("diff-scoped scanning", () => {
	let root: string;

	beforeAll(() => {
		root = mkdtempSync(join(tmpdir(), "nestjs-doctor-scope-int-"));
		git(root, "init", "-q", ".");
		git(root, "config", "user.email", "test@example.com");
		git(root, "config", "user.name", "Test");
		git(root, "config", "commit.gpgsign", "false");

		mkdirSync(join(root, "src"), { recursive: true });
		writeFileSync(
			join(root, "package.json"),
			JSON.stringify({
				name: "scope-fixture",
				dependencies: {
					"@nestjs/core": "^11.0.0",
					"@nestjs/common": "^11.0.0",
				},
			})
		);
		// Pre-existing finding that the change must never be blamed for.
		writeFileSync(
			join(root, "src/legacy.service.ts"),
			service(
				"LegacyService",
				'  read() {\n    return readFileSync("/tmp/a");\n  }'
			)
		);
		git(root, "add", "-A");
		git(root, "commit", "-qm", "base");

		// The change: pad legacy.service.ts so its finding shifts lines without
		// changing, and add a brand-new finding in another file.
		writeFileSync(
			join(root, "src/legacy.service.ts"),
			`${"// padding\n".repeat(12)}${service("LegacyService", '  read() {\n    return readFileSync("/tmp/a");\n  }')}`
		);
		writeFileSync(
			join(root, "src/fresh.service.ts"),
			service(
				"FreshService",
				'  read() {\n    return readFileSync("/tmp/b");\n  }'
			)
		);
		git(root, "add", "-A");
		git(root, "commit", "-qm", "head");
	});

	afterAll(() => {
		rmSync(root, { recursive: true, force: true });
	});

	it("reports both files at full scope", async () => {
		const { diagnostics } = await scanHead(root);
		expect(rulesIn(diagnostics)).toContain("legacy.service.ts");
		expect(rulesIn(diagnostics)).toContain("fresh.service.ts");
	});

	it("reports every finding in the changed files at files scope", async () => {
		const { diagnostics } = await scanHead(root);
		const scope = resolveScope({
			mode: "files",
			targetPath: root,
			base: "HEAD~1",
		});
		expect(scope.mode).toBe("files");
		// Both files changed, so `files` scope still shows the pre-existing one.
		expect(rulesIn(applyScope(diagnostics, scope))).toEqual([
			"fresh.service.ts",
			"legacy.service.ts",
		]);
	});

	it("reports only the new finding at changed scope", async () => {
		const { diagnostics, scanConfig } = await scanHead(root);
		const scope = resolveScope({
			mode: "changed",
			targetPath: root,
			base: "HEAD~1",
		});
		const delta = await computeBaselineDelta(
			diagnostics,
			scope,
			root,
			scanConfig
		);

		expect(delta.available).toBe(true);
		expect(delta.fixed).toBe(0);
		// legacy.service.ts moved down twelve lines but is not a new problem.
		expect(rulesIn(delta.introduced)).toEqual(["fresh.service.ts"]);
	});

	it("counts a resolved finding as fixed", async () => {
		writeFileSync(
			join(root, "src/legacy.service.ts"),
			service("LegacyService", '  read() {\n    return "static";\n  }')
		);
		git(root, "add", "-A");
		git(root, "commit", "-qm", "fix legacy");

		const { diagnostics, scanConfig } = await scanHead(root);
		const scope = resolveScope({
			mode: "changed",
			targetPath: root,
			base: "HEAD~1",
		});
		const delta = await computeBaselineDelta(
			diagnostics,
			scope,
			root,
			scanConfig
		);

		expect(delta.available).toBe(true);
		expect(delta.fixed).toBeGreaterThanOrEqual(1);
		expect(delta.introduced).toEqual([]);
	});

	it("reports everything, and says why, when the base is unreachable", async () => {
		const { diagnostics, scanConfig } = await scanHead(root);
		const scope = resolveScope({
			mode: "changed",
			targetPath: root,
			base: "0000000000000000000000000000000000000000",
		});

		// An unresolvable base degrades during resolution, before any scan runs.
		expect(scope.mode).toBe("full");
		expect(scope.warnings.join(" ")).toContain("not in this checkout");

		const delta = await computeBaselineDelta(
			diagnostics,
			{ ...scope, mode: "changed", baseRef: null },
			root,
			scanConfig
		);
		expect(delta.available).toBe(false);
		expect(delta.introduced).toBe(diagnostics);
	});
});
