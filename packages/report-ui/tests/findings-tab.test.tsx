import {
	cleanup,
	fireEvent,
	render,
	screen,
	within,
} from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { fixtureModel } from "../demo/fixture";
import { App } from "../src/app";

afterEach(cleanup);

const openFindings = () => {
	render(<App model={fixtureModel()} />);
	fireEvent.click(screen.getByRole("tab", { name: "Findings" }));
};

it("lists files in the tree with per-file counts", () => {
	openFindings();
	const tree = document.getElementById("diagnosis-rule-list")!;
	expect(within(tree).getByText("app.module.ts")).toBeTruthy();
	expect(within(tree).getByText("foo.service.ts")).toBeTruthy();
});

it("shows the code view and finding details after selecting a file", () => {
	openFindings();
	fireEvent.click(screen.getByText("app.module.ts"));

	expect(document.querySelectorAll(".code-line").length).toBeGreaterThan(0);
	expect(
		document.querySelector(".code-line.hl-error .line-text")?.textContent
	).toContain("this.warm();");
	expect(
		screen.getAllByText("correctness/no-async-without-await").length
	).toBeGreaterThan(0);
	expect(screen.getByText("Await the call.")).toBeTruthy();
	expect(screen.getByText("Bad")).toBeTruthy();
	expect(document.querySelector(".diag-linecol")?.textContent).toContain(
		"Ln 8"
	);
});

it("renders schema findings without a code line", () => {
	openFindings();
	fireEvent.click(screen.getByText("schema.prisma"));
	expect(screen.getByText("User")).toBeTruthy();
	expect(screen.getByText("Add @@id or @id.")).toBeTruthy();
	expect(document.querySelectorAll(".code-segment").length).toBe(0);
});

it("filters the file view by severity pill", () => {
	openFindings();
	fireEvent.click(screen.getByText("foo.service.ts"));
	expect(screen.getByText("performance/no-unused-providers")).toBeTruthy();

	fireEvent.click(
		within(document.getElementById("diagnosis-sidebar")!).getByText("Filters")
	);
	fireEvent.click(
		within(document.getElementById("diagnosis-sidebar")!).getByText("Errors")
	);
	expect(screen.queryByText("performance/no-unused-providers")).toBeNull();
});

it("hides not-scored findings until the toggle is on", () => {
	const model = fixtureModel();
	model.diagnostics[0].surfaces = ["cli"];
	render(<App model={model} />);
	fireEvent.click(screen.getByRole("tab", { name: "Findings" }));
	fireEvent.click(screen.getByText("foo.service.ts"));

	expect(screen.queryByText("not scored")).toBeNull();

	fireEvent.click(screen.getByText("Show not scored"));
	expect(screen.getByText("not scored")).toBeTruthy();
});
