// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ReportArtifact } from "../../src/common/artifact.js";
import {
	type DiagnosisCallbacks,
	DiagnosisTab,
} from "../../src/report/ui/app/templates/diagnosis.js";
import {
	codeDiagnostic,
	EMPTY_ARTIFACT,
	RICH_ARTIFACT,
} from "./report-artifact-fixture.js";

(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const HIDDEN_NOTSCORED_ROW = /id="diag-notscored-row" style="display:none"/;

const noopCallbacks: DiagnosisCallbacks = {
	setDiagnosisBadge: () => undefined,
};

const staticRender = (artifact: ReportArtifact) =>
	renderToStaticMarkup(
		<DiagnosisTab callbacks={noopCallbacks} report={artifact} />
	);

describe("DiagnosisTab static markup", () => {
	it("shows the clean empty state when there are no diagnostics", () => {
		const html = staticRender(EMPTY_ARTIFACT);
		expect(html).toContain("No issues found");
		expect(html).toContain("Your project passed all checks.");
		expect(html).not.toContain("tree-file");
	});

	it("renders the file tree with visible counts and severity markers", () => {
		const html = staticRender(RICH_ARTIFACT);
		expect(html).toContain('data-path="src/order/order.service.ts"');
		expect(html).toContain("sev-indicator-warning");
		expect(html).toContain("Select a file to view its diagnostics");
		expect(html).toContain('id="diag-file-count"');
	});

	it("hides the not-scored row when every diagnostic is scored", () => {
		const html = staticRender(RICH_ARTIFACT);
		expect(html).toMatch(HIDDEN_NOTSCORED_ROW);
	});
});

describe("DiagnosisTab interactions", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
	});

	const mount = (artifact: ReportArtifact, callbacks = noopCallbacks) => {
		root = createRoot(container);
		act(() =>
			root.render(<DiagnosisTab callbacks={callbacks} report={artifact} />)
		);
	};

	const click = (el: Element | null) => {
		act(() =>
			el?.dispatchEvent(
				new MouseEvent("click", { bubbles: true, cancelable: true })
			)
		);
	};

	it("opens a file's diagnostics when its tree row is clicked", () => {
		mount(RICH_ARTIFACT);
		click(container.querySelector(".tree-file-header"));
		const view = container.querySelector<HTMLElement>("#diagnosis-file-view");
		expect(view?.style.display).toBe("block");
		expect(container.querySelector(".file-view-title")?.textContent).toBe(
			"order.service.ts"
		);
		expect(container.querySelector(".code-rule-badge")?.textContent).toBe(
			"performance/no-unused-providers"
		);
	});

	it("clears the selection when a filter hides the shown file", () => {
		mount(RICH_ARTIFACT);
		click(container.querySelector(".tree-file-header"));
		click(container.querySelector('[data-sev="error"]'));
		const view = container.querySelector<HTMLElement>("#diagnosis-file-view");
		expect(view?.style.display).toBe("none");
		expect(
			container.querySelector<HTMLElement>("#diagnosis-empty-state")?.style
				.display
		).toBe("flex");
		expect(container.querySelector(".tree-file.hidden")).not.toBeNull();
	});

	it("reports the badge count through the callback when not-scored toggles", () => {
		const calls: boolean[] = [];
		const artifact: ReportArtifact = {
			...EMPTY_ARTIFACT,
			diagnostics: [codeDiagnostic({ surfaces: ["cli"] })],
		};
		mount(artifact, { setDiagnosisBadge: (v) => calls.push(v) });
		expect(calls).toEqual([false]);
		const checkbox = container.querySelector<HTMLInputElement>(
			"#diag-show-notscored"
		);
		act(() => {
			checkbox?.click();
		});
		expect(calls).toEqual([false, true]);
		expect(container.querySelector(".tree-file")).not.toBeNull();
	});
});
