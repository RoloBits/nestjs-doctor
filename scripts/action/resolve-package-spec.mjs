#!/usr/bin/env node
/**
 * Turns the action's `version` input into a concrete install spec.
 *
 * `latest` is resolved to the published version number so the toolchain cache
 * key is stable — keying on the literal string "latest" would either freeze the
 * first version a repository ever cached or never hit at all. A local path spec
 * (used by the action's own self-test) is reported non-cacheable so the caller
 * falls through to `npm exec` instead.
 *
 * Writes `spec`, `resolved`, and `cacheable` to $GITHUB_OUTPUT.
 */
import { execFileSync } from "node:child_process";
import { appendFileSync, existsSync } from "node:fs";

const PACKAGE_NAME = "nestjs-doctor";

const setOutput = (name, value) => {
	const file = process.env.GITHUB_OUTPUT;
	if (file) {
		appendFileSync(file, `${name}=${value}\n`);
	} else {
		console.log(`${name}=${value}`);
	}
};

const isLocalSpec = (value) =>
	value.startsWith(".") ||
	value.startsWith("/") ||
	value.startsWith("file:") ||
	existsSync(value);

const requested = (process.argv[2] || "latest").trim() || "latest";

if (isLocalSpec(requested)) {
	setOutput("spec", requested);
	setOutput("resolved", "local");
	setOutput("cacheable", "false");
	process.exit(0);
}

// A spec that already names the package (`nestjs-doctor@0.5.1`, or a tarball
// URL) is passed through; a bare version or dist-tag gets the package prefix.
const namesPackage =
	requested.includes("/") || requested.startsWith(`${PACKAGE_NAME}@`);
const spec = namesPackage ? requested : `${PACKAGE_NAME}@${requested}`;

let resolved = requested.replace(`${PACKAGE_NAME}@`, "");

try {
	resolved = execFileSync("npm", ["view", spec, "version"], {
		encoding: "utf-8",
		stdio: ["ignore", "pipe", "ignore"],
		timeout: 60_000,
	}).trim();
} catch {
	// Offline or a private registry hiccup: fall back to the raw input. The cache
	// key is then less precise, but the install still works.
	console.log(
		`::warning::Could not resolve "${spec}" against the registry; using the raw version for the cache key.`
	);
}

setOutput("spec", spec);
setOutput("resolved", resolved || requested);
setOutput("cacheable", "true");
