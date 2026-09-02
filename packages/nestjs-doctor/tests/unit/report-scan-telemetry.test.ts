import { cpSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import type { ScanTelemetryInput } from "../../src/cli/scan-telemetry-reporter.js";
import { detectMonorepo } from "../../src/engine/project-detector.js";
import {
	MonorepoReportPipeline,
	SingleProjectReportPipeline,
} from "../../src/report/pipeline.js";
import type { ScanPayload } from "../../src/telemetry/scan-telemetry.js";
import { scanTelemetryEnabled } from "../../src/telemetry/send.js";

const FIXTURES = resolve(import.meta.dirname, "../fixtures");

const EMBEDDED_SCAN_ID = /var SCAN = "([^"]+)"/;

const tempRoot = mkdtempSync(join(tmpdir(), "nestjs-doctor-report-telemetry-"));

afterAll(() => {
	rmSync(tempRoot, { recursive: true, force: true });
});

afterEach(() => {
	vi.unstubAllEnvs();
	vi.restoreAllMocks();
});

type Send = NonNullable<ScanTelemetryInput["send"]>;

/** The real gating, minus the environment vitest itself sets. */
const injected = (
	send: Send,
	extra: Partial<ScanTelemetryInput> = {}
): Partial<ScanTelemetryInput> => ({
	env: {},
	hasStoredIdentityFn: () => false,
	isEnabled: (flag, config) => scanTelemetryEnabled(flag, config, {}),
	resolveIdentityFn: () => ({
		anonymousId: "anon-123",
		projectId: "proj-hash",
		stored: true,
	}),
	send,
	...extra,
});

class TestSinglePipeline extends SingleProjectReportPipeline {
	constructor(
		targetPath: string,
		telemetry: boolean,
		overrides: Partial<ScanTelemetryInput>
	) {
		super(targetPath, undefined, "9.9.9", undefined, telemetry, "all");
		this.telemetryOverrides = overrides;
	}
}

class TestMonorepoPipeline extends MonorepoReportPipeline {
	constructor(
		targetPath: string,
		configPath: string | undefined,
		monorepo: Awaited<ReturnType<typeof detectMonorepo>> & object,
		overrides: Partial<ScanTelemetryInput>
	) {
		super(targetPath, configPath, monorepo, "9.9.9", undefined, true, "all");
		this.telemetryOverrides = overrides;
	}
}

const runPipeline = async <T extends SingleProjectReportPipeline>(
	pipeline: T
): Promise<T> => {
	await pipeline
		.resolveConfig()
		.buildContext()
		.runRules()
		.buildResult()
		.generateHtml()
		.run();
	return pipeline;
};

/** Lets the report embed its beacon, which vitest's own env otherwise blocks. */
const allowBeacon = (): void => {
	vi.stubEnv("VITEST", "");
	vi.stubEnv("NODE_ENV", "development");
};

const sentPayload = (send: Send): ScanPayload =>
	(send as unknown as { mock: { calls: [ScanPayload][] } }).mock.calls[0][0];

describe("report scan telemetry", () => {
	it("reports the scan a --report run performed", async () => {
		const send = vi.fn(() => true);
		await runPipeline(
			new TestSinglePipeline(
				resolve(FIXTURES, "basic-app"),
				true,
				injected(send)
			)
		);

		expect(send).toHaveBeenCalledTimes(1);
		expect(sentPayload(send)).toMatchObject({
			output_format: "report",
			report_requested: true,
		});
	});

	it("stamps the payload with the id the beacon carries", async () => {
		allowBeacon();
		const send = vi.fn(() => true);
		const pipeline = await runPipeline(
			new TestSinglePipeline(
				resolve(FIXTURES, "basic-app"),
				true,
				injected(send)
			)
		);

		const embedded = EMBEDDED_SCAN_ID.exec(pipeline.generatedHtml)?.[1];
		expect(embedded).toBeDefined();
		expect(sentPayload(send).scan_id).toBe(embedded);
	});

	it("sends nothing under --no-telemetry", async () => {
		// Without this the beacon is blocked by vitest's env, not by the flag.
		allowBeacon();
		const send = vi.fn(() => true);
		const pipeline = await runPipeline(
			new TestSinglePipeline(
				resolve(FIXTURES, "basic-app"),
				false,
				injected(send)
			)
		);

		expect(send).not.toHaveBeenCalled();
		expect(pipeline.generatedHtml).not.toContain("var SCAN");
	});

	it("reports a total at least as long as the measured scan, single project", async () => {
		const send = vi.fn(() => true);
		await runPipeline(
			new TestSinglePipeline(
				resolve(FIXTURES, "basic-app"),
				true,
				injected(send)
			)
		);

		const payload = sentPayload(send);
		expect(payload.total_ms).toBeGreaterThanOrEqual(payload.duration_ms);
	});

	it("reports a total at least as long as the measured scan, monorepo", async () => {
		const targetPath = resolve(FIXTURES, "monorepo-app");
		const monorepo = await detectMonorepo(targetPath);
		if (!monorepo) {
			throw new Error("monorepo-app fixture was not detected as a monorepo");
		}

		const send = vi.fn(() => true);
		const pipeline = new TestMonorepoPipeline(
			targetPath,
			undefined,
			monorepo,
			injected(send)
		);
		await pipeline
			.resolveConfig()
			.buildContext()
			.runRules()
			.buildResult()
			.generateHtml()
			.run();

		const payload = sentPayload(send);
		expect(payload.total_ms).toBeGreaterThanOrEqual(payload.duration_ms);
	});

	it("sends nothing when a sub-project opted out", async () => {
		// Without this the beacon is blocked by vitest's env, not by the opt-out.
		allowBeacon();
		// The root config stays silent; only apps/api opts out.
		const targetPath = join(tempRoot, "opted-out-monorepo");
		cpSync(resolve(FIXTURES, "monorepo-app"), targetPath, { recursive: true });
		writeFileSync(
			join(targetPath, "apps", "api", "nestjs-doctor.config.json"),
			JSON.stringify({ telemetry: false })
		);
		const monorepo = await detectMonorepo(targetPath);
		if (!monorepo) {
			throw new Error("monorepo-app copy was not detected as a monorepo");
		}

		const send = vi.fn(() => true);
		const pipeline = new TestMonorepoPipeline(
			targetPath,
			undefined,
			monorepo,
			// Only the sub-project opt-out may stop this send.
			injected(send, { isEnabled: () => true })
		);
		await pipeline
			.resolveConfig()
			.buildContext()
			.runRules()
			.buildResult()
			.generateHtml()
			.run();

		expect(send).not.toHaveBeenCalled();
		expect(pipeline.generatedHtml).not.toContain("var SCAN");
	});
});

describe("report first-run notice", () => {
	const runWithFirstSend = async (
		firstSend: boolean
	): Promise<{ lines: string[] }> => {
		vi.resetModules();
		const lines: string[] = [];
		vi.doMock("../../src/engine/project-detector.js", () => ({
			detectMonorepo: () => Promise.resolve(null),
		}));
		vi.doMock("../../src/report/output.js", () => ({
			logMonorepoSummary: () => undefined,
			logSingleProjectSummary: () => undefined,
			openReportInBrowser: () => lines.push("opened"),
			writeReportFile: () => Promise.resolve("/repo/report.html"),
		}));
		vi.doMock("../../src/report/pipeline.js", () => ({
			MonorepoReportPipeline: class {},
			SingleProjectReportPipeline: class {
				firstSend = firstSend;
				generatedHtml = "<html>";
				scanResult = {};
				resolveConfig() {
					return this;
				}
				buildContext() {
					return this;
				}
				runRules() {
					return this;
				}
				buildResult() {
					return this;
				}
				generateHtml() {
					return this;
				}
				run() {
					return Promise.resolve();
				}
			},
		}));

		const { logger } = await import("../../src/ui/logger.js");
		vi.spyOn(logger, "info").mockImplementation((...args) => {
			lines.push(`info:${args.join(" ")}`);
		});
		vi.spyOn(logger, "warn").mockImplementation((...args) => {
			lines.push(`warn:${args.join(" ")}`);
		});

		const { runReport } = await import("../../src/report/setup.js");
		await runReport(
			"/repo",
			undefined,
			undefined,
			undefined,
			true,
			"all",
			"9.9.9"
		);
		vi.doUnmock("../../src/engine/project-detector.js");
		vi.doUnmock("../../src/report/output.js");
		vi.doUnmock("../../src/report/pipeline.js");
		return { lines };
	};

	it("prints the first-run notice after the report is written", async () => {
		const { lines } = await runWithFirstSend(true);

		expect(lines[0]).toContain("Report written to");
		expect(lines[1]).toContain("reported this scan anonymously");
		expect(lines[2]).toBe("opened");
	});

	it("prints nothing on a later run", async () => {
		const { lines } = await runWithFirstSend(false);

		expect(lines[0]).toContain("Report written to");
		expect(lines.some((line) => line.startsWith("warn:"))).toBe(false);
	});
});
