import { describe, expect, it } from "vitest";
import { getReportStyles } from "../../src/report/ui/styles.js";

describe("report styles", () => {
	const css = getReportStyles();

	it("resolves the font stack into the custom property", () => {
		expect(css).toContain('--font: "IBM Plex Mono"');
		expect(css).not.toContain("REPORT_FONT_STACK");
	});

	it("concatenates every sheet", () => {
		for (const marker of [
			":root {",
			"#header-row1 {",
			"#mg-info-pop",
			"#diagnosis-sidebar {",
			".summary-grid {",
			".playground-editor {",
			"#schema-sidebar {",
			".ep-code-panel {",
		]) {
			expect(css).toContain(marker);
		}
	});

	it("keeps the responsive overrides last in the cascade", () => {
		// Same-specificity overrides, so anything emitted after them wins instead.
		expect(css.trimEnd().endsWith("}")).toBe(true);
		const media = css.lastIndexOf("@media (max-width: 640px)");
		expect(media).toBeGreaterThan(-1);
		expect(css.indexOf("#endpoints-sidebar {")).toBeLessThan(media);
		expect(css.slice(media)).not.toContain("/* ──");
	});
});
