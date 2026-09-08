import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { createAstParser } from "../../src/engine/graph/ast-parser.js";
import { createSourceOnlyHost } from "../../src/engine/graph/source-only-host.js";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "nestjs-doctor-host-"));

afterAll(() => {
	fs.rmSync(root, { recursive: true, force: true });
});

/** Writes a file and every directory above it, returning the posix path. */
function write(relative: string, contents = "export const a = 1;\n") {
	const full = path.join(root, relative);
	fs.mkdirSync(path.dirname(full), { recursive: true });
	fs.writeFileSync(full, contents);
	return full.split(path.sep).join("/");
}

function link(from: string, to: string) {
	const target = path.join(root, from);
	fs.mkdirSync(path.dirname(target), { recursive: true });
	fs.symlinkSync(path.join(root, to), target, "dir");
	return target.split(path.sep).join("/");
}

describe("createSourceOnlyHost", () => {
	it("hides a file inside an installed package", () => {
		const dep = write("app/node_modules/dep/index.d.ts");
		const host = createSourceOnlyHost([]);
		expect(host.fileExistsSync(dep)).toBe(false);
	});

	it("hides the directories of an installed package", () => {
		write("dirs/node_modules/dep/index.d.ts");
		const host = createSourceOnlyHost([]);
		expect(
			host.directoryExistsSync(
				`${root}/dirs/node_modules/dep`.split(path.sep).join("/")
			)
		).toBe(false);
	});

	it("shows a package linked out of node_modules", () => {
		const source = write("ws/packages/lib/index.ts");
		link("ws/app/node_modules/@acme/lib", "ws/packages/lib");
		const host = createSourceOnlyHost([]);
		const through = `${root}/ws/app/node_modules/@acme/lib/index.ts`
			.split(path.sep)
			.join("/");
		expect(fs.existsSync(source)).toBe(true);
		expect(host.fileExistsSync(through)).toBe(true);
	});

	it("hides a package linked to another place inside node_modules", () => {
		write("pnpm/node_modules/.pnpm/dep@1/node_modules/dep/index.d.ts");
		link(
			"pnpm/node_modules/dep",
			"pnpm/node_modules/.pnpm/dep@1/node_modules/dep"
		);
		const host = createSourceOnlyHost([]);
		const through = `${root}/pnpm/node_modules/dep/index.d.ts`
			.split(path.sep)
			.join("/");
		expect(host.fileExistsSync(through)).toBe(false);
	});

	it("reads a file the scan collected, wherever it sits", () => {
		const inside = write("kept/node_modules/pkg/src/a.ts");
		const host = createSourceOnlyHost([inside]);
		expect(host.fileExistsSync(inside)).toBe(true);
		expect(host.readFileSync(inside)).toContain("export const a");
	});

	it("reads a file inside a hidden package when handed the path", () => {
		const dep = write("read/node_modules/dep/index.d.ts");
		const host = createSourceOnlyHost([]);
		expect(host.fileExistsSync(dep)).toBe(false);
		expect(host.readFileSync(dep)).toContain("export const a");
	});

	it("leaves a directory whose name only starts with node_modules alone", () => {
		const near = write("near/node_modules_helper/index.ts");
		const host = createSourceOnlyHost([]);
		expect(host.fileExistsSync(near)).toBe(true);
	});

	it("gives the same answer every time it is asked", () => {
		const dep = write("stable/node_modules/dep/index.d.ts");
		const host = createSourceOnlyHost([]);
		const answers = [1, 2, 3].map(() => host.fileExistsSync(dep));
		expect(answers).toEqual([false, false, false]);
	});
});

describe("the parser built on that host", () => {
	it("still types the standard library", async () => {
		const file = write(
			"lib/app.ts",
			`
      export const list = [1, 2, 3].map((n) => n + 1);
      export const later = Promise.resolve("done");
      export const text = "a,b".split(",").join("-");
    `
		);
		const project = await createAstParser([file]);
		const source = project.getSourceFileOrThrow(file);
		const typeOf = (name: string) =>
			source.getVariableDeclarationOrThrow(name).getType().getText();
		expect(typeOf("list")).toBe("number[]");
		expect(typeOf("later")).toBe("Promise<string>");
		expect(typeOf("text")).toBe("string");
	});

	it("keeps the name of a type it cannot read", async () => {
		write(
			"named/node_modules/dep/index.d.ts",
			"export declare class Client { run(): Promise<void>; }\n"
		);
		const file = write(
			"named/src/app.ts",
			`
      import { Client } from 'dep';
      export class Service {
        constructor(private readonly client: Client) {}
      }
    `
		);
		const project = await createAstParser([file]);
		const parameter = project
			.getSourceFileOrThrow(file)
			.getClassOrThrow("Service")
			.getConstructors()[0]
			.getParameters()[0];
		expect(parameter.getTypeNode()?.getText()).toBe("Client");
		expect(parameter.getType().getText()).toBe("Client");
	});
});
