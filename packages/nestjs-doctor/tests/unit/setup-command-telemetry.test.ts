import { beforeEach, describe, expect, it, vi } from "vitest";
import { runCiInstall } from "../../src/cli/ci-install.js";
import { initSkill } from "../../src/cli/init.js";
import { type CliArgs, CliSetup } from "../../src/cli/setup.js";
import { reportCommandTelemetry } from "../../src/telemetry/command-telemetry.js";

vi.mock("../../src/cli/init.js", () => ({ initSkill: vi.fn() }));
vi.mock("../../src/cli/ci-install.js", () => ({ runCiInstall: vi.fn() }));
vi.mock("../../src/telemetry/command-telemetry.js", () => ({
	reportCommandTelemetry: vi.fn(),
}));

const args = (overrides: Partial<CliArgs>): CliArgs =>
	({ _: [], path: ".", telemetry: true, ...overrides }) as CliArgs;

const run = (overrides: Partial<CliArgs>) =>
	new CliSetup(args(overrides), "1.2.3")
		.resolveTargetPath()
		.handleCiInstall()
		.handleInit()
		.run();

beforeEach(() => {
	vi.mocked(initSkill).mockReset();
	vi.mocked(runCiInstall).mockReset();
	vi.mocked(reportCommandTelemetry).mockReset();
});

describe("--init reporting", () => {
	it("reports once the skills landed somewhere", async () => {
		vi.mocked(initSkill).mockResolvedValue(2);

		await run({ init: true });

		expect(reportCommandTelemetry).toHaveBeenCalledWith(
			expect.objectContaining({ command: "init", from: "flag" })
		);
	});

	it("reports nothing when every target failed", async () => {
		vi.mocked(initSkill).mockResolvedValue(0);

		await run({ init: true });

		expect(reportCommandTelemetry).not.toHaveBeenCalled();
	});
});

describe("ci install reporting", () => {
	it("reports a workflow it wrote", async () => {
		vi.mocked(runCiInstall).mockResolvedValue({ code: 0, status: "created" });

		await run({ _: ["ci", "install"] });

		expect(reportCommandTelemetry).toHaveBeenCalledWith(
			expect.objectContaining({ command: "ci_install", from: "flag" })
		);
	});

	it("reports nothing when the workflow was already there", async () => {
		vi.mocked(runCiInstall).mockResolvedValue({ code: 0, status: "exists" });

		await run({ _: ["ci", "install"] });

		expect(reportCommandTelemetry).not.toHaveBeenCalled();
	});
});
