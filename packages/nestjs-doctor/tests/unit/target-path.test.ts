import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { validateTargetPathArg } from "../../src/cli/target-path.js";

const TMP = resolve(import.meta.dirname, "../.tmp-target-path");

describe("validateTargetPathArg", () => {
	beforeAll(() => {
		mkdirSync(TMP, { recursive: true });
		writeFileSync(resolve(TMP, "a.ts"), "export const a = 1;\n");
	});

	afterAll(() => {
		rmSync(TMP, { recursive: true, force: true });
	});

	it("accepts an existing directory", () => {
		expect(validateTargetPathArg(TMP)).toBeNull();
	});

	it("rejects a path that does not exist", () => {
		const missing = resolve(TMP, "nope");
		expect(validateTargetPathArg(missing)).toBe(
			`Path does not exist: ${missing}`
		);
	});

	it("rejects a file", () => {
		const file = resolve(TMP, "a.ts");
		expect(validateTargetPathArg(file)).toBe(
			`Path is not a directory: ${file}`
		);
	});
});
