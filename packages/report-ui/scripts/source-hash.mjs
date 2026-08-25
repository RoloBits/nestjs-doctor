import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, sep } from "node:path";

const CRLF = /\r\n/g;

/** Stable digest over every file under dir, for embed freshness checks. */
export function computeSourceHash(dir) {
	const files = [];
	const walk = (current, prefix) => {
		for (const entry of readdirSync(current).sort()) {
			const full = join(current, entry);
			const rel = prefix ? `${prefix}${sep}${entry}` : entry;
			if (statSync(full).isDirectory()) {
				walk(full, rel);
			} else {
				files.push([rel, full]);
			}
		}
	};
	walk(dir, "");

	const hash = createHash("sha256");
	for (const [rel, full] of files) {
		// Repo-relative posix paths, LF newlines.
		hash.update(rel.split(sep).join("/"));
		hash.update(readFileSync(full, "utf8").replace(CRLF, "\n"));
	}
	return hash.digest("hex");
}
