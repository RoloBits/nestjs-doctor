import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { computeSourceHash } from "../../../report-ui/scripts/source-hash.mjs";

const SOURCE_HASH = /^\/\/ source-hash: ([0-9a-f]{64})$/m;

const generatedPath = join(
	import.meta.dirname,
	"../../src/report/ui/generated/report-ui.generated.ts"
);
const sourceDir = join(import.meta.dirname, "../../../report-ui/src");

describe("committed report embed", () => {
	it("was built from the current report-ui sources", () => {
		const content = readFileSync(generatedPath, "utf8");
		const recorded = SOURCE_HASH.exec(content)?.[1];
		expect(recorded).toBeTruthy();
		expect(computeSourceHash(sourceDir)).toBe(recorded);
	});
});
