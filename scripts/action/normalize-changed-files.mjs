#!/usr/bin/env node
/**
 * Rewrites repository-relative changed-file paths into scan-relative ones.
 *
 * Both the local `git diff` fast path and the `pulls.listFiles` API fallback
 * feed through here, so the CLI receives an identical set either way — a
 * mismatched prefix silently drops every file and the scan reads as "nothing
 * changed" while quietly reporting nothing at all.
 *
 * Usage: normalize-changed-files.mjs <scanPrefix> <outputPath> < paths
 */
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";

// Only source the scanner can actually parse; everything else is noise on a
// pull request and would widen the changed set for no benefit.
const SCANNABLE = /\.(?:ts|mts|cts|prisma)$/;
const BACKSLASH_RE = /\\/g;
const LEADING_DOT_SLASH_RE = /^\.\/?/;
const LEADING_DOT_SLASH_STRICT_RE = /^\.\//;
const TRAILING_SLASHES_RE = /\/+$/;

/**
 * @param {string[]} files repository-relative paths
 * @param {string} scanPrefix the scanned directory, relative to the repo root
 *   (`"."` or `""` when the scan root is the repo root)
 */
export function normalizeChangedFiles(files, scanPrefix) {
	const prefix = String(scanPrefix ?? "")
		.replace(BACKSLASH_RE, "/")
		.replace(LEADING_DOT_SLASH_RE, "")
		.replace(TRAILING_SLASHES_RE, "");

	const normalized = [];
	for (const file of files) {
		const path = String(file ?? "")
			.replace(BACKSLASH_RE, "/")
			.replace(LEADING_DOT_SLASH_STRICT_RE, "");
		if (!(path && SCANNABLE.test(path))) {
			continue;
		}
		if (!prefix) {
			normalized.push(path);
			continue;
		}
		if (path === prefix) {
			continue;
		}
		if (path.startsWith(`${prefix}/`)) {
			normalized.push(path.slice(prefix.length + 1));
		}
	}

	return [...new Set(normalized)].sort();
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
	const [, , scanPrefix, outputPath] = process.argv;
	const raw = readFileSync(0, "utf-8");
	const incoming = raw.split("\n").filter((line) => line.trim());
	const files = normalizeChangedFiles(incoming, scanPrefix);
	writeFileSync(
		outputPath,
		files.length ? `${files.join("\n")}\n` : "",
		"utf-8"
	);

	// The pre-filter total lets the report say "5 of 9 scanned" rather than a
	// bare 5, which reads as a miscount beside the pull request's own count.
	if (process.env.GITHUB_OUTPUT) {
		appendFileSync(
			process.env.GITHUB_OUTPUT,
			`changed-total=${incoming.length}\n`
		);
	}
	console.log(
		`nestjs-doctor: ${files.length} of ${incoming.length} changed file(s) in scope`
	);
}
