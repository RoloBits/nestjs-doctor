import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/** Stable digest over every file under dir, for embed freshness checks. */
export function computeSourceHash(dir) {
	const files = [];
	const walk = (current) => {
		for (const entry of readdirSync(current).sort()) {
			const full = join(current, entry);
			if (statSync(full).isDirectory()) {
				walk(full);
			} else {
				files.push(full);
			}
		}
	};
	walk(dir);

	const hash = createHash("sha256");
	for (const file of files) {
		hash.update(file);
		hash.update(readFileSync(file));
	}
	return hash.digest("hex");
}
