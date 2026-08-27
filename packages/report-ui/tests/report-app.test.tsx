// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ReportApp } from "../src/components/report/report-app";
import demo from "../src/lib/demo-artifact.json";
import type { ReportArtifact } from "../src/lib/model/artifact";

const artifact = demo as unknown as ReportArtifact;

const SCORE_LABEL_RE = /86 out of 100/;
const FINDINGS_COUNT_RE = /2 findings/;
const THROTTLER_MSG_RE = /No throttling guard/;
const HELP_TEXT_RE = /Add ThrottlerGuard to protect against brute-force abuse/;

afterEach(cleanup);

describe("ReportApp", () => {
	it("renders score and project info from the artifact", () => {
		render(<ReportApp artifact={artifact} />);
		expect(screen.getByText("demo-app")).toBeTruthy();
		expect(screen.getByRole("img", { name: SCORE_LABEL_RE })).toBeTruthy();
	});

	it("switches tabs and shows per-tab content", () => {
		render(<ReportApp artifact={artifact} />);
		fireEvent.click(screen.getByRole("tab", { name: "Diagnosis" }));
		expect(screen.getByText(FINDINGS_COUNT_RE)).toBeTruthy();
		fireEvent.click(screen.getByRole("tab", { name: "Modules" }));
		expect(screen.getByText("UsersModule")).toBeTruthy();
		fireEvent.click(screen.getByRole("tab", { name: "Rule Lab" }));
		expect(screen.getByRole("button", { name: "Run check" })).toBeTruthy();
	});

	it("expands a finding to reveal its help text and rule id", () => {
		render(<ReportApp artifact={artifact} />);
		fireEvent.click(screen.getByRole("tab", { name: "Diagnosis" }));
		fireEvent.click(screen.getByText(THROTTLER_MSG_RE));
		expect(screen.getByText(HELP_TEXT_RE)).toBeTruthy();
		expect(screen.getByText("security/missing-throttler")).toBeTruthy();
	});

	it("shares only picked sections", () => {
		const urls: string[] = [];
		const originalCreate = URL.createObjectURL;
		// jsdom lacks these; expression arrows keep them non-empty per lint.
		URL.createObjectURL = ((blob: Blob) => {
			urls.push(blob.type);
			return "blob:test";
		}) as typeof URL.createObjectURL;
		URL.revokeObjectURL = (() => undefined) as typeof URL.revokeObjectURL;

		render(<ReportApp artifact={artifact} />);
		fireEvent.click(screen.getByRole("button", { name: "Share" }));
		const boxes = screen.getAllByRole("checkbox");
		for (const box of boxes.slice(1)) {
			fireEvent.click(box);
		}
		fireEvent.click(screen.getByRole("button", { name: "Download JSON" }));

		expect(urls).toEqual(["application/json"]);
		URL.createObjectURL = originalCreate;
	});
});
