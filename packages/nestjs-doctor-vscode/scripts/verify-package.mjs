#!/usr/bin/env node
// The extension ships three bundles, two of them hand-copied out of the LSP
// package by the build script, and it wires itself to the manifest by string.
// Nothing else checks either, and both fail silently: a missing server.cjs
// means the client never starts, a renamed command means the status bar does
// nothing when clicked.
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const pkgRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(
	readFileSync(join(pkgRoot, "package.json"), "utf-8")
);
const source = readFileSync(join(pkgRoot, "src", "extension.ts"), "utf-8");
const problems = [];

// The entry the manifest names, plus the two the extension spawns.
const entry = manifest.main.replace(/^\.\//, "");
for (const file of [entry, "dist/server.cjs", "dist/scan-worker.cjs"]) {
	if (!existsSync(join(pkgRoot, file))) {
		problems.push(`${file} is missing. Run \`pnpm build\` first.`);
	}
}

// Every command the extension registers has to be contributed, or it cannot
// be invoked from the palette.
const contributed = new Set(
	(manifest.contributes?.commands ?? []).map((c) => c.command)
);
const registered = [...source.matchAll(/registerCommand\(\s*"([^"]+)"/g)].map(
	(m) => m[1]
);
const wired = [...source.matchAll(/\.command\s*=\s*"([^"]+)"/g)].map(
	(m) => m[1]
);
for (const command of [...registered, ...wired]) {
	if (!contributed.has(command)) {
		problems.push(`command "${command}" is used in source but not contributed`);
	}
}
for (const command of contributed) {
	if (!(registered.includes(command) || wired.includes(command))) {
		problems.push(`command "${command}" is contributed but never registered`);
	}
}

// Settings the server and the extension read, which the manifest has to
// declare or the user gets no default and no editor completion.
const declared = new Set(
	Object.keys(manifest.contributes?.configuration?.properties ?? {})
);
const serverSource = readFileSync(
	join(pkgRoot, "..", "nestjs-doctor-lsp", "src", "server.ts"),
	"utf-8"
);
const section = "nestjsDoctor";
const read = new Set([
	...[...source.matchAll(/config\.get<[^>]*>\(\s*"([^"]+)"/g)].map((m) => m[1]),
	...[...serverSource.matchAll(/settings\.([a-zA-Z]+)/g)].map((m) => m[1]),
]);
for (const key of read) {
	if (!declared.has(`${section}.${key}`)) {
		problems.push(`setting "${section}.${key}" is read but not contributed`);
	}
}

if (problems.length > 0) {
	console.error("VS Code package verification failed:");
	for (const problem of problems) {
		console.error(`  - ${problem}`);
	}
	process.exit(1);
}

console.log(
	`VS Code package ok: 3 bundles, ${contributed.size} command(s), ${read.size} setting(s) all wired`
);
