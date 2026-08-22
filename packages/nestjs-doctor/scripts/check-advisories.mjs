/**
 * Walks WATCHED_PACKAGES against the GitHub Advisory Database and reports what
 * src/engine/advisories/data.ts is missing or no longer needs. Needs `gh`.
 */
import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const run = promisify(execFile);
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const ADVISORIES = join(root, "src/engine/advisories");

const SEVERITY = {
	critical: "critical",
	high: "high",
	medium: "moderate",
	low: "low",
};

const listed = (file, name) => {
	const source = readFileSync(join(ADVISORIES, file), "utf-8");
	const block = source.split(`const ${name}`)[1] ?? "";
	return [...block.slice(0, block.indexOf("];")).matchAll(/"([^"]+)"/g)].map(
		(match) => match[1]
	);
};

const packages = [
	...listed("watched.ts", "OFFICIAL_PACKAGES"),
	...listed("watched.ts", "ECOSYSTEM_PACKAGES"),
];

const shipped = new Set();
const source = readFileSync(join(ADVISORIES, "data.ts"), "utf-8");
for (const entry of source.split(/\n\t\{/).slice(1)) {
	const ghsa = entry.match(/ghsa: "([^"]+)"/)?.[1];
	const pkg = entry.match(/packageName: "([^"]+)"/)?.[1];
	const patched = entry.match(/patched: "([^"]+)"/)?.[1];
	if (ghsa && pkg) {
		shipped.add(`${pkg} ${ghsa} ${patched}`);
	}
}

const missing = [];
const seen = new Set();
const unreachable = [];

for (const pkg of packages) {
	let records;
	try {
		const { stdout } = await run("gh", [
			"api",
			`/advisories?ecosystem=npm&affects=${pkg}&per_page=100`,
		]);
		records = JSON.parse(stdout);
	} catch (error) {
		console.error(`  ! ${pkg}: ${String(error.message).split("\n")[0]}`);
		unreachable.push(pkg);
		continue;
	}

	for (const record of records) {
		if (record.withdrawn_at) {
			continue;
		}
		for (const vuln of record.vulnerabilities ?? []) {
			if (vuln.package?.name !== pkg) {
				continue;
			}
			// Falls back to the range ceiling when no patched version is named.
			const ceiling =
				vuln.vulnerable_version_range?.match(/<\s*=?\s*([^\s,]+)$/)?.[1];
			const patched = vuln.first_patched_version ?? ceiling;
			const key = `${pkg} ${record.ghsa_id} ${patched}`;
			seen.add(key);
			if (!shipped.has(key)) {
				missing.push({
					pkg,
					ghsa: record.ghsa_id,
					cve: record.cve_id,
					severity: SEVERITY[record.severity] ?? record.severity,
					range: vuln.vulnerable_version_range,
					patched,
					summary: record.summary,
				});
			}
		}
	}
}

// A package that could not be queried was not checked, so nothing below can
// claim the table is current.
const stale =
	unreachable.length > 0 ? [] : [...shipped].filter((k) => !seen.has(k));

console.log(
	`Checked ${packages.length} packages against ${shipped.size} shipped rows.`
);

if (missing.length > 0) {
	console.log(`${missing.length} row(s) to add:`);
	for (const row of missing) {
		console.log(
			`  ${row.pkg} ${row.ghsa} ${row.cve ?? "(no CVE)"} ${row.severity}`
		);
		console.log(`    range ${row.range} -> patched ${row.patched}`);
		console.log(`    ${row.summary}`);
	}
}

if (stale.length > 0) {
	console.log(`${stale.length} shipped row(s) the database no longer reports:`);
	for (const key of stale) {
		console.log(`  ${key}`);
	}
}

if (unreachable.length > 0) {
	console.log(
		`${unreachable.length} package(s) could not be queried, so the table was not checked: ${unreachable.join(", ")}`
	);
} else if (missing.length === 0 && stale.length === 0) {
	console.log("The table is up to date.");
}

process.exitCode =
	missing.length > 0 || stale.length > 0 || unreachable.length > 0 ? 1 : 0;
