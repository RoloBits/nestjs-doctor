import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pkgPath = join(root, "packages/nestjs-doctor/package.json");
const { version } = JSON.parse(readFileSync(pkgPath, "utf-8"));

const files = [
	join(root, "packages/nestjs-doctor/skill/SKILL.md"),
	join(root, ".claude/skills/nestjs-doctor/SKILL.md"),
];

for (const file of files) {
	const content = readFileSync(file, "utf-8");
	const updated = content.replace(/^> v.+$/m, `> v${version}`);
	writeFileSync(file, updated, "utf-8");
}

execSync(`git add -f ${files.join(" ")}`, { cwd: root, stdio: "inherit" });

console.log(`Synced SKILL.md version to v${version}`);
