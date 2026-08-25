import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { prepareReportData } from "../../src/report/formatters/report-data.js";
import { getReportScripts } from "../../src/report/ui/scripts.js";
import { graph, reportProviders, result } from "./report-fixtures.js";

// EXPECTED pins the legacy report script bytes.
const EXPECTED =
	"64ed7093de56195be76f35292e6f8a627472b8a5cbd783f2dddc0ab3a2a392d6";

describe("golden legacy report script", () => {
	it("keeps the emitted script bytes stable", () => {
		const data = prepareReportData(graph(), result(), {
			providers: reportProviders,
		});
		const scripts = getReportScripts(data);
		expect(createHash("sha256").update(scripts).digest("hex")).toBe(EXPECTED);
	});
});
