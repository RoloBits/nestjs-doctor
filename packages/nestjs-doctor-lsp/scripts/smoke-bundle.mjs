#!/usr/bin/env node
// The server resolves nestjs-doctor from the user's workspace, so the bundle
// must not require it. Unit tests import the source and never see the bundle,
// which is where that regression lived: a value-import put
// require("nestjs-doctor") at the top of dist/server.cjs and every install
// outside this monorepo died with MODULE_NOT_FOUND before reading a request.
import { spawn } from "node:child_process";
import {
	copyFileSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
} from "node:fs";
import { isBuiltin } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const pkgRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const bundle = join(pkgRoot, "dist", "server.cjs");
const REQUIRE_RE = /require\("([^"]+)"\)/g;

if (!existsSync(bundle)) {
	console.error(`Missing ${bundle}. Run \`pnpm build\` first.`);
	process.exit(1);
}

const fail = (message) => {
	console.error(`LSP bundle smoke failed: ${message}`);
	process.exit(1);
};

// 1. Nothing outside Node's builtins may be required.
const source = readFileSync(bundle, "utf-8");
const required = [...source.matchAll(REQUIRE_RE)].map((m) => m[1]);
const bare = [...new Set(required.filter((id) => !isBuiltin(id)))];
if (bare.length > 0) {
	fail(`bundle requires ${bare.join(", ")}, which is not installed beside it`);
}

// 2. It has to actually start with no nestjs-doctor anywhere above it.
const work = mkdtempSync(join(tmpdir(), "nd-lsp-smoke-"));
mkdirSync(join(work, "dist"));
copyFileSync(bundle, join(work, "dist", "server.cjs"));

const child = spawn(process.execPath, ["dist/server.cjs", "--stdio"], {
	cwd: work,
	stdio: ["pipe", "pipe", "pipe"],
});

let stderr = "";
let stdout = "";
child.stderr.on("data", (chunk) => {
	stderr += chunk;
});
child.stdout.on("data", (chunk) => {
	stdout += chunk;
});

// A well-formed initialize request; a live server answers, a dead one does not.
const body = JSON.stringify({
	jsonrpc: "2.0",
	id: 1,
	method: "initialize",
	params: { processId: null, rootUri: null, capabilities: {} },
});
child.stdin.write(`Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`);

setTimeout(() => {
	child.kill();
	rmSync(work, { recursive: true, force: true });

	if (
		stderr.includes("MODULE_NOT_FOUND") ||
		stderr.includes("Cannot find module")
	) {
		fail(
			`server could not load outside a workspace:\n${stderr.split("\n").slice(0, 6).join("\n")}`
		);
	}
	if (!stdout.includes("capabilities")) {
		fail(
			`server did not answer initialize. stdout: ${stdout.slice(0, 200) || "(empty)"}\nstderr: ${stderr.slice(0, 400) || "(empty)"}`
		);
	}

	console.log(
		"LSP bundle ok: builtins only, answers initialize outside a workspace"
	);
}, 3000);
