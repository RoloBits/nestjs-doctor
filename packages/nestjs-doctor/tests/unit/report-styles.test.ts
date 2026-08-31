import { describe, expect, it } from "vitest";
import { getReportStyles } from "../../src/report/ui/styles.js";

describe("report styles", () => {
	const css = getReportStyles();

	it("resolves the font stack into the custom property", () => {
		expect(css).toContain('--font: "IBM Plex Mono"');
		expect(css).not.toContain("REPORT_FONT_STACK");
	});

	it("weaves the empty boot phase", () => {
		expect(css).toContain(".boot-phase-empty {");
		expect(css).toContain("repeating-linear-gradient(45deg");
	});

	it("weaves the guide under a zero-length phase", () => {
		expect(css).toContain(".boot-guide-zero {");
	});

	it("weaves the widened stretch of the axis", () => {
		expect(css).toContain(".boot-axis-warp {");
	});

	it("dashes a widened phase and stacks the name over the time", () => {
		expect(css).toContain(".boot-phase-inflated {");
		expect(css).toContain("flex-direction: column");
		expect(css).toContain(
			".boot-phase-ms { color: rgba(255,255,255,0.55); overflow: hidden; text-overflow: ellipsis; }"
		);
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
