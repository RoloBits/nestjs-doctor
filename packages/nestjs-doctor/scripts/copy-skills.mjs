#!/usr/bin/env node
// Copies skills/ into dist/skills/ so the published package ships real
// markdown. Validates each SKILL.md here so a broken one fails the build
// instead of installing dead.
import { cp, readdir, readFile, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = join(root, "skills");
const TARGET = join(root, "dist", "skills");

const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---/;
const VERSION_LINE = "> v0.0.0";

const validate = (dir, body) => {
	const frontmatter = FRONTMATTER_RE.exec(body)?.[1];
	if (!frontmatter) {
		throw new Error(`skills/${dir}/SKILL.md has no --- frontmatter --- block`);
	}
	for (const key of ["name", "description"]) {
		if (!new RegExp(`^${key}:\\s*\\S`, "m").test(frontmatter)) {
			throw new Error(
				`skills/${dir}/SKILL.md frontmatter is missing "${key}:"`
			);
		}
	}
	if (!body.includes(VERSION_LINE)) {
		throw new Error(`skills/${dir}/SKILL.md needs a "${VERSION_LINE}" line`);
	}
};

const dirs = (await readdir(SOURCE, { withFileTypes: true }))
	.filter((entry) => entry.isDirectory())
	.map((entry) => entry.name)
	.sort();

if (dirs.length === 0) {
	throw new Error("skills/ has no skill directories");
}

await Promise.all(
	dirs.map(async (dir) =>
		validate(dir, await readFile(join(SOURCE, dir, "SKILL.md"), "utf-8"))
	)
);

await rm(TARGET, { force: true, recursive: true });
await cp(SOURCE, TARGET, { recursive: true });

process.stdout.write(`Copied ${dirs.length} skills to dist/skills\n`);
