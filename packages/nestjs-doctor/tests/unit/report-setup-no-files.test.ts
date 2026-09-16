import {
	mkdirSync,
	mkdtempSync,
	readdirSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	afterAll,
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	vi,
} from "vitest";
import { reportScanTelemetry } from "../../src/cli/scan-telemetry-reporter.js";
import {
	openReportInBrowser,
	writeReportFile,
} from "../../src/report/output.js";
import { runReport } from "../../src/report/setup.js";

vi.mock("../../src/report/output.js", async (importOriginal) => {
	const actual =
		await importOriginal<typeof import("../../src/report/output.js")>();
	return {
		...actual,
		openReportInBrowser: vi.fn(),
		writeReportFile: vi.fn(actual.writeReportFile),
	};
});

vi.mock("../../src/cli/scan-telemetry-reporter.js", () => ({
	reportScanTelemetry: vi.fn(),
}));

const roots: string[] = [];
const scratch = (): string => {
	const dir = mkdtempSync(join(tmpdir(), "nd-report-no-files-"));
	roots.push(dir);
	return dir;
};

afterAll(() => {
	for (const dir of roots) {
		rmSync(dir, { recursive: true, force: true });
	}
});

const report = (dir: string): Promise<void> =>
	runReport(dir, undefined, undefined, undefined, true, "all", "9.9.9");

describe("--report on a directory with no TypeScript files", () => {
	let stderr: string[];

	beforeEach(() => {
		stderr = [];
		vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
			stderr.push(args.join(" "));
		});
		vi.spyOn(console, "log").mockImplementation(() => undefined);
		process.exitCode = undefined;
	});

	afterEach(() => {
		process.exitCode = undefined;
		vi.restoreAllMocks();
		vi.mocked(openReportInBrowser).mockClear();
		vi.mocked(writeReportFile).mockClear();
		vi.mocked(reportScanTelemetry).mockClear();
	});

	it("writes nothing, opens nothing, and exits 2", async () => {
		const dir = scratch();

		await report(dir);

		expect(writeReportFile).not.toHaveBeenCalled();
		expect(openReportInBrowser).not.toHaveBeenCalled();
		expect(readdirSync(dir)).toEqual([]);
		expect(process.exitCode).toBe(2);
		expect(stderr.join("\n")).toContain(
			`No TypeScript source files found under ${dir}`
		);
	});

	it("still reports the scan with a file count of zero", async () => {
		await report(scratch());

		expect(reportScanTelemetry).toHaveBeenCalledWith(
			expect.objectContaining({ fileCount: 0, outputFormat: "report" })
		);
	});

	it("applies to a monorepo whose packages hold no TypeScript files", async () => {
		const dir = scratch();
		writeFileSync(
			join(dir, "package.json"),
			JSON.stringify({ name: "root", workspaces: ["packages/*"] })
		);
		mkdirSync(join(dir, "packages", "api"), { recursive: true });
		writeFileSync(
			join(dir, "packages", "api", "package.json"),
			JSON.stringify({ name: "api", dependencies: { "@nestjs/core": "^11" } })
		);

		await report(dir);

		expect(reportScanTelemetry).toHaveBeenCalledWith(
			expect.objectContaining({ fileCount: 0, monorepo: true })
		);
		expect(writeReportFile).not.toHaveBeenCalled();
		expect(openReportInBrowser).not.toHaveBeenCalled();
		expect(process.exitCode).toBe(2);
	});
});
