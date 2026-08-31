import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import {
	buildAnalysisContext,
	diagnose,
	resolveScanConfig,
} from "../../src/engine/scanner.js";
import { getRuleExamples } from "../../src/report/data/examples.js";

const roots: string[] = [];
afterAll(() => {
	for (const root of roots) {
		rmSync(root, { force: true, recursive: true });
	}
});

// The samples are fragments, so they need imports and a Nest dependency to
// parse and to be detected as a Nest project at all.
const PRELUDE = `import {
	Body, Controller, Get, Global, Inject, Injectable, Module,
	Param, Post, Query, Res, UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { Type } from 'class-transformer';
import { ValidateNested } from 'class-validator';

class AddressDto {
	street = '';
}
`;

/** Filenames rules key on. A sample fires in at least one of them. */
const FILENAMES = [
	"sample.controller.ts",
	"sample.service.ts",
	"sample.module.ts",
	"sample.entity.ts",
	"index.ts",
];

/**
 * Rules whose sample cannot fire from one standalone file. Each needs a
 * fixture shape the sample alone does not describe.
 */
const NEEDS_WIDER_FIXTURE = new Map<string, string>([
	[
		"performance/no-unused-module-exports",
		"project-scoped: needs a second module importing this one",
	],
	[
		"architecture/no-manual-instantiation",
		"the class has to be a registered provider, which one file cannot show",
	],
]);

const scan = async (source: string, filename: string): Promise<string[]> => {
	const root = mkdtempSync(join(tmpdir(), "nd-examples-"));
	roots.push(root);
	mkdirSync(join(root, "src"), { recursive: true });
	writeFileSync(
		join(root, "package.json"),
		JSON.stringify({
			dependencies: {
				"@nestjs/common": "^11.0.0",
				"@nestjs/core": "^11.0.0",
				typeorm: "^0.3.0",
			},
			name: "example-fixture",
		})
	);
	writeFileSync(join(root, "src", filename), `${PRELUDE}${source}\n`, "utf-8");
	const scanConfig = await resolveScanConfig(root);
	const context = await buildAnalysisContext(root, scanConfig);
	const output = await diagnose(context);
	return output.diagnostics.map((diagnostic) => diagnostic.rule);
};

const examples = getRuleExamples();
const testable = Object.keys(examples).filter(
	(rule) => !NEEDS_WIDER_FIXTURE.has(rule)
);

/** The first filename the bad sample fires in, or null if it never does. */
const fireContext = async (
	source: string,
	rule: string
): Promise<string | null> => {
	for (const filename of FILENAMES) {
		if ((await scan(source, filename)).includes(rule)) {
			return filename;
		}
	}
	return null;
};

describe("rule examples", () => {
	it("covers most of the built-in rules", () => {
		expect(testable.length).toBeGreaterThan(40);
	});

	// Both halves in one test, and the good sample is checked in the very
	// context the bad one fired in: a good sample the rule never inspects
	// would otherwise pass for the wrong reason.
	it.each(testable)(
		"%s: bad fires, good does not, in the same file",
		async (rule) => {
			const filename = await fireContext(examples[rule].bad, rule);
			expect(filename, "the bad sample never fires this rule").not.toBeNull();
			expect(await scan(examples[rule].good, filename as string)).not.toContain(
				rule
			);
		},
		60_000
	);

	it.each([...NEEDS_WIDER_FIXTURE.keys()])(
		"%s: has a sample, and is documented as needing a wider fixture",
		(rule) => {
			expect(examples[rule]?.bad ?? "").not.toBe("");
			expect(NEEDS_WIDER_FIXTURE.get(rule)).toBeTruthy();
		}
	);
});
