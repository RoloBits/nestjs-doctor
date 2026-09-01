import { expect, it } from "vitest";
import { summarizeWarnings } from "../../src/cli/formatters/warning-summary.js";

const dup = (name: string) =>
	`@Module class ${name} is declared in 2 files (a.ts, b.ts); their imports, providers, and exports are analyzed as one module`;

it("collapses repeated duplicate-module warnings into one line", () => {
	const warnings = [dup("A"), dup("B"), dup("C"), "custom rule x failed"];
	const lines = summarizeWarnings(warnings, false);
	expect(lines).toHaveLength(2);
	expect(lines[0]).toBe("custom rule x failed");
	expect(lines[1]).toContain("3 @Module class names are declared");
	expect(lines[1]).toContain("--verbose");
});

it("prints everything verbatim under --verbose", () => {
	const warnings = [dup("A"), dup("B"), "custom rule x failed"];
	expect(summarizeWarnings(warnings, true)).toEqual(warnings);
});

it("keeps a single duplicate-module warning verbatim", () => {
	const warnings = [dup("A")];
	expect(summarizeWarnings(warnings, false)).toEqual(warnings);
});
