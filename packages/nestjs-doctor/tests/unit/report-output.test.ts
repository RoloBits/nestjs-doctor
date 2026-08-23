import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { openCommand, writeReportFile } from "../../src/report/output.js";

const roots: string[] = [];
const scratch = (): string => {
	const dir = mkdtempSync(join(tmpdir(), "nd-report-out-"));
	roots.push(dir);
	return dir;
};

afterAll(() => {
	for (const dir of roots) {
		rmSync(dir, { recursive: true, force: true });
	}
});

describe("writeReportFile", () => {
	it("writes beside the project with no output path", async () => {
		const target = scratch();
		const written = await writeReportFile(target, "<h1>ok</h1>");

		expect(written).toBe(join(target, "nestjs-doctor-report.html"));
		expect(readFileSync(written, "utf-8")).toBe("<h1>ok</h1>");
	});

	it("writes where --output names, leaving the project untouched", async () => {
		const target = scratch();
		const out = join(scratch(), "reports", "health.html");
		const written = await writeReportFile(target, "<h1>ok</h1>", out);

		expect(written).toBe(out);
		expect(readFileSync(out, "utf-8")).toBe("<h1>ok</h1>");
		expect(existsSync(join(target, "nestjs-doctor-report.html"))).toBe(false);
	});

	it("creates the parent directory", async () => {
		const out = join(scratch(), "a", "b", "c", "report.html");
		await writeReportFile(scratch(), "<h1>ok</h1>", out);

		expect(existsSync(out)).toBe(true);
	});

	it("resolves a relative output path against the working directory", async () => {
		const target = scratch();
		const cwd = process.cwd();
		process.chdir(scratch());
		try {
			const written = await writeReportFile(target, "<h1>ok</h1>", "out.html");
			expect(written).toBe(resolve("out.html"));
			expect(existsSync(written)).toBe(true);
		} finally {
			process.chdir(cwd);
		}
	});
});

describe("openCommand", () => {
	const platform = process.platform;
	const setPlatform = (value: string): void => {
		Object.defineProperty(process, "platform", { value });
	};
	afterAll(() => setPlatform(platform));

	it("passes the path as one argument on every platform", () => {
		const path = "/tmp/a b/report.html";
		setPlatform("darwin");
		expect(openCommand(path)).toEqual(["open", [path]]);
		setPlatform("linux");
		expect(openCommand(path)).toEqual(["xdg-open", [path]]);
		setPlatform("win32");
		expect(openCommand(path)).toEqual(["cmd", ["/c", "start", "", path]]);
	});
});
