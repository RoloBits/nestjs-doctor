import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it, vi } from "vitest";
import { MonorepoPipeline } from "../../src/cli/pipeline.js";
import type { ScanTelemetryInput } from "../../src/cli/scan-telemetry-reporter.js";
import { reportScanTelemetry } from "../../src/cli/scan-telemetry-reporter.js";
import type { PipelineOptions } from "../../src/cli/setup.js";
import { detectMonorepo } from "../../src/engine/project-detector.js";
import { MonorepoReportPipeline } from "../../src/report/pipeline.js";

vi.mock("../../src/cli/scan-telemetry-reporter.js", () => ({
	reportScanTelemetry: vi.fn(() => false),
}));

const reportScanTelemetryMock = vi.mocked(reportScanTelemetry);

/** Two apps, each with one `eval()` suppressed by an inline directive. */
const buildSuppressedMonorepo = (root: string): void => {
	const appModule = (className: string, file: string) =>
		`import { Module } from "@nestjs/common";
import { ${className} } from "./${file}";

@Module({
	providers: [${className}],
})
export class AppModule {}
`;
	const suppressedEvalService = (className: string) =>
		`import { Injectable } from "@nestjs/common";

@Injectable()
export class ${className} {
	run(input: string): unknown {
		// nestjs-doctor-ignore-next-line security/no-eval
		return eval(input);
	}
}
`;

	writeFileSync(
		join(root, "package.json"),
		JSON.stringify({
			name: "suppressed-monorepo",
			dependencies: { "@nestjs/common": "^11.0.0", "@nestjs/core": "^11.0.0" },
		})
	);
	writeFileSync(
		join(root, "nest-cli.json"),
		JSON.stringify({
			monorepo: true,
			root: "apps/api",
			projects: {
				admin: {
					root: "apps/admin",
					sourceRoot: "apps/admin/src",
					type: "application",
				},
				api: {
					root: "apps/api",
					sourceRoot: "apps/api/src",
					type: "application",
				},
			},
		})
	);
	mkdirSync(join(root, "apps/api/src"), { recursive: true });
	mkdirSync(join(root, "apps/admin/src"), { recursive: true });
	writeFileSync(
		join(root, "apps/api/src/app.module.ts"),
		appModule("ApiService", "api.service")
	);
	writeFileSync(
		join(root, "apps/api/src/api.service.ts"),
		suppressedEvalService("ApiService")
	);
	writeFileSync(
		join(root, "apps/admin/src/app.module.ts"),
		appModule("AdminService", "admin.service")
	);
	writeFileSync(
		join(root, "apps/admin/src/admin.service.ts"),
		suppressedEvalService("AdminService")
	);
};

const tempRoot = mkdtempSync(
	join(tmpdir(), "nestjs-doctor-suppressed-inline-monorepo-")
);
buildSuppressedMonorepo(tempRoot);

afterAll(() => {
	rmSync(tempRoot, { recursive: true, force: true });
});

/** A scan with every output and the spinner suppressed. */
const options = (): PipelineOptions => ({
	base: undefined,
	blocking: "none",
	changedFilesFrom: undefined,
	configPath: undefined,
	format: "console",
	interactive: false,
	isMachineReadable: true,
	jsonCompact: false,
	minScore: undefined,
	outputPath: undefined,
	scanId: "8f1c4a2e-0b3d-4f56-9a71-2c5d8e0f3b64",
	scope: "full",
	score: false,
	shareCode: false,
	shareSections: undefined,
	skipOutput: true,
	sources: "all",
	staged: false,
	telemetry: false,
	verbose: false,
});

const lastSuppressed = (): Record<string, number> => {
	const calls = reportScanTelemetryMock.mock.calls;
	const input = calls.at(-1)?.[0] as ScanTelemetryInput;
	return input.suppressed;
};

describe("monorepo suppressed_inline sum", () => {
	it("sums it across sub-projects, cli pipeline", async () => {
		const monorepo = await detectMonorepo(tempRoot);
		if (!monorepo) {
			throw new Error("temp fixture was not detected as a monorepo");
		}

		const pipeline = new MonorepoPipeline(tempRoot, monorepo, options());
		await pipeline
			.resolveConfig()
			.buildContext()
			.runRules()
			.buildResult()
			.applyScope()
			.output()
			.run();

		expect(lastSuppressed()).toEqual({ "security/no-eval": 2 });
	});

	it("sums it across sub-projects, report pipeline", async () => {
		const monorepo = await detectMonorepo(tempRoot);
		if (!monorepo) {
			throw new Error("temp fixture was not detected as a monorepo");
		}

		const pipeline = new MonorepoReportPipeline(
			tempRoot,
			undefined,
			monorepo,
			"9.9.9",
			undefined,
			false,
			"all"
		);
		await pipeline
			.resolveConfig()
			.buildContext()
			.runRules()
			.buildResult()
			.run();

		expect(lastSuppressed()).toEqual({ "security/no-eval": 2 });
	});
});
