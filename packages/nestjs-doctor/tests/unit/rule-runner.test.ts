import { Project } from "ts-morph";
import { describe, expect, it } from "vitest";
import {
	runFileRules,
	runSchemaRules,
	separateRules,
} from "../../src/engine/rule-runner.js";
import type { AnyRule, Rule, SchemaRule } from "../../src/rules/types.js";
import type { NestjsDoctorConfig } from "../../src/types/config.js";
import type { SchemaEntity, SchemaGraph } from "../../src/types/schema.js";

function makeFileRule(id: string): AnyRule {
	return {
		meta: {
			id,
			category: "correctness",
			severity: "warning",
			description: "",
			help: "",
		},
		check: () => {
			// noop stub
		},
	};
}

function makeProjectRule(id: string): AnyRule {
	return {
		meta: {
			id,
			category: "architecture",
			severity: "warning",
			description: "",
			help: "",
			scope: "project",
		},
		check: () => {
			// noop stub
		},
	};
}

function makeSchemaRule(id: string): AnyRule {
	return {
		meta: {
			id,
			category: "schema",
			severity: "warning",
			description: "",
			help: "",
			scope: "schema",
		},
		check: () => {
			// noop stub
		},
	};
}

function makeGraph(entities: SchemaEntity[] = []): SchemaGraph {
	const entityMap = new Map<string, SchemaEntity>();
	for (const entity of entities) {
		entityMap.set(entity.name, entity);
	}
	return { entities: entityMap, relations: [], orm: "typeorm" };
}

// ── separateRules ──

describe("separateRules", () => {
	it("should separate file, project, and schema rules", () => {
		const rules = [
			makeFileRule("file-a"),
			makeProjectRule("project-a"),
			makeSchemaRule("schema-a"),
			makeFileRule("file-b"),
			makeSchemaRule("schema-b"),
		];
		const { fileRules, projectRules, schemaRules } = separateRules(rules);

		expect(fileRules).toHaveLength(2);
		expect(projectRules).toHaveLength(1);
		expect(schemaRules).toHaveLength(2);
		expect(fileRules.map((r) => r.meta.id)).toEqual(["file-a", "file-b"]);
		expect(projectRules.map((r) => r.meta.id)).toEqual(["project-a"]);
		expect(schemaRules.map((r) => r.meta.id)).toEqual(["schema-a", "schema-b"]);
	});

	it("should return empty arrays when no rules match", () => {
		const { fileRules, projectRules, schemaRules } = separateRules([]);

		expect(fileRules).toHaveLength(0);
		expect(projectRules).toHaveLength(0);
		expect(schemaRules).toHaveLength(0);
	});
});

// ── runSchemaRules ──

describe("runSchemaRules", () => {
	it("should collect diagnostics with correct metadata", () => {
		const rule: SchemaRule = {
			meta: {
				id: "schema/test-rule",
				category: "schema",
				severity: "error",
				description: "test",
				help: "fix it",
				scope: "schema",
			},
			check(ctx) {
				ctx.report({ message: "something is wrong", entity: "User" });
			},
		};
		const graph = makeGraph([
			{
				name: "User",
				tableName: "users",
				filePath: "/user.ts",
				columns: [],
				relations: [],
			},
		]);

		const { diagnostics, errors } = runSchemaRules(graph, [rule]);

		expect(errors).toHaveLength(0);
		expect(diagnostics).toHaveLength(1);
		expect(diagnostics[0]).toMatchObject({
			message: "something is wrong",
			rule: "schema/test-rule",
			category: "schema",
			scope: "schema",
			severity: "error",
		});
	});

	it("should return empty diagnostics when no violations", () => {
		const rule: SchemaRule = {
			meta: {
				id: "schema/noop",
				category: "schema",
				severity: "warning",
				description: "",
				help: "",
				scope: "schema",
			},
			check() {
				// noop — no violations to report
			},
		};

		const { diagnostics, errors } = runSchemaRules(makeGraph(), [rule]);

		expect(diagnostics).toHaveLength(0);
		expect(errors).toHaveLength(0);
	});

	it("should capture thrown errors without crashing", () => {
		const rule: SchemaRule = {
			meta: {
				id: "schema/broken",
				category: "schema",
				severity: "error",
				description: "",
				help: "",
				scope: "schema",
			},
			check() {
				throw new Error("rule exploded");
			},
		};

		const { diagnostics, errors } = runSchemaRules(makeGraph(), [rule]);

		expect(diagnostics).toHaveLength(0);
		expect(errors).toHaveLength(1);
		expect(errors[0].ruleId).toBe("schema/broken");
		expect(errors[0].error).toBeInstanceOf(Error);
	});
});

describe("runFileRules", () => {
	it("passes config into file-scoped rule context", () => {
		const project = new Project({ useInMemoryFileSystem: true });
		project.createSourceFile("test.ts", "const value = 1;");

		const rule: Rule = {
			meta: {
				id: "architecture/config-aware-test",
				category: "architecture",
				severity: "warning",
				description: "",
				help: "",
			},
			check(context) {
				const ruleConfig =
					context.config?.rules?.["architecture/no-manual-instantiation"];
				if (typeof ruleConfig === "object" && ruleConfig !== null) {
					context.report({
						filePath: context.filePath,
						message: "config received",
						help: "",
						line: 1,
						column: 1,
					});
				}
			},
		};

		const config: NestjsDoctorConfig = {
			rules: {
				"architecture/no-manual-instantiation": {
					excludeClasses: ["Logger"],
				},
			},
		};

		const { diagnostics, errors } = runFileRules(
			project,
			["test.ts"],
			[rule],
			config
		);

		expect(errors).toHaveLength(0);
		expect(diagnostics).toHaveLength(1);
		expect(diagnostics[0].message).toBe("config received");
	});
});
