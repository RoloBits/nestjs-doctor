import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { fixtureModel } from "../demo/fixture";
import type { TabName } from "../src/app";
import { App } from "../src/app";

afterEach(cleanup);

const TABS: TabName[] = [
	"summary",
	"diagnosis",
	"modules",
	"endpoints",
	"schema",
	"lab",
];

it("renders one panel per section with the beacon ids", () => {
	render(<App model={fixtureModel()} />);
	for (const tab of TABS) {
		expect(document.getElementById(`tab-${tab}`)).toBeTruthy();
	}
});

it("tracks section views through the telemetry hook and toggles .active", () => {
	const track = vi.fn();
	vi.stubGlobal("__ndTrack", track);
	render(<App model={fixtureModel()} />);

	fireEvent.click(screen.getByRole("tab", { name: "Modules Graph" }));

	expect(track).toHaveBeenCalledWith("modules");
	expect(
		document.getElementById("tab-modules")?.classList.contains("active")
	).toBe(true);
	expect(
		document.getElementById("tab-summary")?.classList.contains("active")
	).toBe(false);
});
