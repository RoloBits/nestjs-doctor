#!/usr/bin/env node
// Packs the tarball, installs it into a throwaway project, and runs `--init`
// there. Unit tests mock the filesystem, so only this catches a skill file
// that never made it into the published package.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const pkgRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const work = mkdtempSync(join(tmpdir(), "nd-smoke-"));
const run = (cmd, args, cwd) =>
	execFileSync(cmd, args, { cwd, encoding: "utf-8", stdio: "pipe" });

let failed = false;
try {
	const packed = run(
		"npm",
		["pack", "--pack-destination", work],
		pkgRoot
	).trim();
	const tarball = join(work, packed.split("\n").at(-1));

	const project = join(work, "project");
	run("mkdir", ["-p", project], work);
	writeFileSync(
		join(project, "package.json"),
		JSON.stringify({ name: "smoke", private: true, version: "1.0.0" })
	);
	run("npm", ["install", "--no-audit", "--no-fund", tarball], project);

	const cli = join(
		project,
		"node_modules",
		"nestjs-doctor",
		"dist",
		"cli",
		"index.mjs"
	);
	const skills = readdirSync(
		join(project, "node_modules", "nestjs-doctor", "dist", "skills")
	).sort();
	const expected = readdirSync(join(pkgRoot, "skills")).sort();
	if (skills.join() !== expected.join()) {
		throw new Error(
			`dist/skills holds ${skills.join(", ")}, expected ${expected.join(", ")}`
		);
	}

	run("node", [cli, "--init"], project);
	const installed = readdirSync(join(project, ".agents")).sort();
	const missing = expected.filter((name) => !installed.includes(name));
	if (missing.length > 0) {
		throw new Error(`--init wrote no .agents/${missing.join(", .agents/")}`);
	}

	// references/ only reaches the user if the installer copies the directory.
	const refs = readdirSync(
		join(project, ".agents", "nestjs-doctor-create-rule", "references")
	).sort();
	if (refs.length === 0) {
		throw new Error(
			"--init wrote no references/ for nestjs-doctor-create-rule"
		);
	}

	process.stdout.write(
		`Packed install ok: ${installed.join(", ")} (+${refs.length} references)\n`
	);
} catch (error) {
	failed = true;
	process.stderr.write(`${error.stderr ?? ""}${error.message}\n`);
} finally {
	rmSync(work, { force: true, recursive: true });
}

process.exit(failed ? 1 : 0);
