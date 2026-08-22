import { execFileSync } from "node:child_process";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

const SCRIPT = resolve(
	import.meta.dirname,
	"../../scripts/check-advisories.mjs"
);
const roots: string[] = [];

afterAll(() => {
	for (const dir of roots) {
		rmSync(dir, { recursive: true, force: true });
	}
});

/** Runs the checker with a stub `gh` on PATH, so nothing reaches the network. */
const run = (ghBody: string): { code: number; out: string } => {
	const dir = mkdtempSync(join(tmpdir(), "nd-advcheck-"));
	roots.push(dir);
	const gh = join(dir, "gh");
	writeFileSync(gh, `#!/bin/sh\n${ghBody}\n`);
	chmodSync(gh, 0o755);

	try {
		const out = execFileSync("node", [SCRIPT], {
			encoding: "utf-8",
			env: { ...process.env, PATH: `${dir}:${process.env.PATH}` },
		});
		return { code: 0, out };
	} catch (error) {
		const e = error as { status: number; stdout: string; stderr: string };
		return { code: e.status, out: `${e.stdout}${e.stderr}` };
	}
};

// The stub below is a POSIX shell script, which Windows cannot execute. The
// command itself runs on a maintainer's machine and on the Linux weekly job.
describe.skipIf(process.platform === "win32")("advisories:check", () => {
	it("says the table is current when the database agrees", () => {
		const { code, out } = run('echo "[]"');

		// Nothing published for any watched package, and the table only carries
		// rows for packages, so no row can be missing.
		expect(out).toContain("Checked 60 packages");
		expect(code).toBe(1);
		expect(out).toContain("no longer reports");
	});

	it("fails, and says nothing was checked, when a query cannot run", () => {
		const { code, out } = run('echo "boom" >&2; exit 1');

		expect(code).toBe(1);
		expect(out).toContain("could not be queried");
		expect(out).not.toContain("The table is up to date.");
	});

	it("never claims success on a run that reached nothing", () => {
		const { out } = run('echo "boom" >&2; exit 1');

		expect(out).not.toContain("up to date");
	});
});
