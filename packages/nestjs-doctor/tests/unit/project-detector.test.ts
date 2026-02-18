import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { detectProject } from "../../src/core/project-detector.js";

const FIXTURES = resolve(import.meta.dirname, "../fixtures");

describe("project-detector", () => {
	it("detects NestJS version and framework from basic-app", async () => {
		const info = await detectProject(resolve(FIXTURES, "basic-app"));
		expect(info.name).toBe("basic-app");
		expect(info.nestVersion).toBe("10.0.0");
		expect(info.framework).toBe("express");
		expect(info.orm).toBeNull();
	});

	it("detects Prisma ORM from bad-practices fixture", async () => {
		const info = await detectProject(resolve(FIXTURES, "bad-practices"));
		expect(info.name).toBe("bad-practices-app");
		expect(info.orm).toBe("prisma");
	});

	it("handles missing package.json gracefully", async () => {
		const info = await detectProject("/tmp/nonexistent-path-xyz");
		expect(info.name).toBe("unknown");
		expect(info.nestVersion).toBeNull();
		expect(info.orm).toBeNull();
		expect(info.framework).toBeNull();
	});
});
