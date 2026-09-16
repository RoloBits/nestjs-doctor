import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it, vi } from "vitest";
import {
	type CommandTelemetryInput,
	reportCommandTelemetry,
} from "../../src/telemetry/command-telemetry.js";

const roots: string[] = [];

const project = (config?: object): string => {
	const dir = mkdtempSync(join(tmpdir(), "nd-command-telemetry-"));
	roots.push(dir);
	if (config) {
		writeFileSync(
			join(dir, "nestjs-doctor.config.json"),
			JSON.stringify(config)
		);
	}
	return dir;
};

afterAll(() => {
	for (const dir of roots) {
		rmSync(dir, { recursive: true, force: true });
	}
});

const buildInput = (
	overrides: Partial<CommandTelemetryInput> = {}
): CommandTelemetryInput => ({
	command: "init",
	env: {},
	from: "flag",
	optionsTelemetry: true,
	resolveIdentityFn: vi.fn(() => ({
		anonymousId: "anon-123",
		projectId: "proj-hash",
		stored: true,
	})),
	send: vi.fn(() => true),
	targetPath: project(),
	...overrides,
});

describe("command telemetry", () => {
	it("reports the command and where it ran from, under the install id", async () => {
		const input = buildInput({ command: "ci_install", from: "menu" });

		await reportCommandTelemetry(input);

		expect(input.send).toHaveBeenCalledTimes(1);
		expect(input.send).toHaveBeenCalledWith(
			"command_completed",
			{ command: "ci_install", from: "menu" },
			"anon-123",
			input.env
		);
	});

	it("carries neither the project id nor the path", async () => {
		const input = buildInput();

		await reportCommandTelemetry(input);

		const [, properties] = vi.mocked(input.send!).mock.calls[0]!;
		expect(JSON.stringify(properties)).not.toContain("proj-hash");
		expect(JSON.stringify(properties)).not.toContain(input.targetPath);
	});

	it("sends nothing under --no-telemetry", async () => {
		const input = buildInput({ optionsTelemetry: false });

		await reportCommandTelemetry(input);

		expect(input.send).not.toHaveBeenCalled();
		expect(input.resolveIdentityFn).not.toHaveBeenCalled();
	});

	it("sends nothing when the project config opts out", async () => {
		const input = buildInput({ targetPath: project({ telemetry: false }) });

		await reportCommandTelemetry(input);

		expect(input.send).not.toHaveBeenCalled();
	});

	it("sends nothing under DO_NOT_TRACK", async () => {
		const input = buildInput({ env: { DO_NOT_TRACK: "1" } });

		await reportCommandTelemetry(input);

		expect(input.send).not.toHaveBeenCalled();
	});

	it("never throws when the identity cannot be resolved", async () => {
		const input = buildInput({
			resolveIdentityFn: () => {
				throw new Error("read-only home");
			},
		});

		await expect(reportCommandTelemetry(input)).resolves.toBeUndefined();
		expect(input.send).not.toHaveBeenCalled();
	});
});
