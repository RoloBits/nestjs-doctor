import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pkgPath = join(root, "packages/nestjs-doctor/package.json");
const { version } = JSON.parse(readFileSync(pkgPath, "utf-8"));

// packages/nestjs-doctor/skills keeps the `> v0.0.0` placeholder, which the
// installer substitutes per install. Only this checkout's own copies are pinned.
const skillsRoot = join(root, ".claude/skills");
let files = [];
try {
	files = readdirSync(skillsRoot, { withFileTypes: true })
		.filter((entry) => entry.isDirectory())
		.map((entry) => join(skillsRoot, entry.name, "SKILL.md"))
		.filter((file) => existsSync(file));
} catch {
	// .claude/ is local-only tooling and may be absent from a checkout.
}

for (const file of files) {
	const content = readFileSync(file, "utf-8");
	const updated = content.replace(/^> v.+$/m, `> v${version}`);
	writeFileSync(file, updated, "utf-8");
}

console.log(`Synced ${files.length} SKILL.md versions to v${version}`);
