import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { fixtureModel } from "../demo/fixture";
import { App } from "../src/app";

it("debug filters", () => {
	render(<App model={fixtureModel()} />);
	fireEvent.click(screen.getByRole("tab", { name: "Findings" }));
	fireEvent.click(screen.getByText("Filters"));
	console.log(
		"ROWS:",
		document
			.getElementById("diagnosis-sidebar")
			?.querySelector(".filter-rows")
			?.innerHTML.slice(0, 400)
	);
	expect(1).toBe(1);
});
