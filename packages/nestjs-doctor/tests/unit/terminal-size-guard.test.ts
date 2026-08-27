import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const SOURCE_ROOT = join(PACKAGE_ROOT, "src");
const CHILD_TIMEOUT_MS = 10_000;

/** `?? 80` keeps a real 0, which a pty reports when it has no window size. */
const NULLISH_SIZE = /\.(?:columns|rows)\s*\?\?/;
const ORA_IMPORT = /from\s+["']ora["']/;
const TYPESCRIPT_FILE = /\.tsx?$/;

const SIZELESS_PTY_CYCLE = `
import spinner from "yocto-spinner";

const noop = () => undefined;
const stream = {
	clearLine: noop,
	columns: 0,
	cursorTo: noop,
	isTTY: true,
	moveCursor: noop,
	once: noop,
	removeListener: noop,
	rows: 0,
	write: noop,
};

const instance = spinner({ handleSignals: false, stream, text: "Scanning" }).start();
instance.text = "Parsing files 5/10";
instance.stop("Scan complete");
process.stdout.write("returned");
`;

const sourceFiles = (): string[] =>
	readdirSync(SOURCE_ROOT, { encoding: "utf8", recursive: true })
		.filter((entry) => TYPESCRIPT_FILE.test(entry))
		.filter((entry) => !entry.includes("generated"))
		.map((entry) => join(SOURCE_ROOT, entry));

const offendersMatching = (pattern: RegExp): string[] =>
	sourceFiles()
		.filter((file) => pattern.test(readFileSync(file, "utf8")))
		.map((file) => file.slice(PACKAGE_ROOT.length + 1));

describe("terminal size handling", () => {
	it("never reads a width or height with ??, which keeps a real zero", () => {
		expect(offendersMatching(NULLISH_SIZE)).toEqual([]);
	});

	it("does not import ora, whose clear() never returns at zero columns", () => {
		expect(offendersMatching(ORA_IMPORT)).toEqual([]);
	});

	it("depends on a spinner that handles a zero width", () => {
		const manifest = JSON.parse(
			readFileSync(join(PACKAGE_ROOT, "package.json"), "utf8")
		) as { dependencies?: Record<string, string> };
		const dependencies = manifest.dependencies ?? {};

		expect(dependencies).toHaveProperty("yocto-spinner");
		expect(dependencies).not.toHaveProperty("ora");
	});

	it("returns from a spinner cycle on a stream reporting zero columns", () => {
		// A regression loops forever, so the timeout fails this rather than
		// hanging the suite: the loop is synchronous and no timer can break it.
		const output = execFileSync(
			"node",
			["--input-type=module", "-e", SIZELESS_PTY_CYCLE],
			{ cwd: PACKAGE_ROOT, encoding: "utf8", timeout: CHILD_TIMEOUT_MS }
		);

		expect(output).toContain("returned");
	});
});
