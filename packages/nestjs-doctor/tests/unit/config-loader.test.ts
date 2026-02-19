import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadConfig } from "../../src/core/config-loader.js";
import { DEFAULT_CONFIG } from "../../src/types/config.js";

const tempRootDirectory = fs.mkdtempSync(
	path.join(os.tmpdir(), "nestjs-doctor-config-test-")
);

afterAll(() => {
	fs.rmSync(tempRootDirectory, { recursive: true, force: true });
});

describe("loadConfig", () => {
	describe("nestjs-doctor.config.json", () => {
		let configDirectory: string;

		beforeAll(() => {
			configDirectory = path.join(tempRootDirectory, "with-config-file");
			fs.mkdirSync(configDirectory, { recursive: true });
			fs.writeFileSync(
				path.join(configDirectory, "nestjs-doctor.config.json"),
				JSON.stringify({
					ignore: {
						rules: ["architecture/no-orm-in-services"],
						files: ["src/generated/**"],
					},
				})
			);
		});

		it("loads config from nestjs-doctor.config.json", async () => {
			const config = await loadConfig(configDirectory);
			expect(config.ignore).toEqual({
				rules: ["architecture/no-orm-in-services"],
				files: ["src/generated/**"],
			});
		});
	});

	describe(".nestjs-doctor.json", () => {
		let configDirectory: string;

		beforeAll(() => {
			configDirectory = path.join(tempRootDirectory, "with-dot-config");
			fs.mkdirSync(configDirectory, { recursive: true });
			fs.writeFileSync(
				path.join(configDirectory, ".nestjs-doctor.json"),
				JSON.stringify({
					rules: {
						"architecture/no-god-service": false,
					},
				})
			);
		});

		it("loads config from .nestjs-doctor.json", async () => {
			const config = await loadConfig(configDirectory);
			expect(config.rules).toEqual({
				"architecture/no-god-service": false,
			});
		});
	});

	describe("package.json nestjs-doctor key", () => {
		let packageJsonDirectory: string;

		beforeAll(() => {
			packageJsonDirectory = path.join(
				tempRootDirectory,
				"with-package-json-config"
			);
			fs.mkdirSync(packageJsonDirectory, { recursive: true });
			fs.writeFileSync(
				path.join(packageJsonDirectory, "package.json"),
				JSON.stringify({
					name: "test-project",
					"nestjs-doctor": {
						ignore: {
							rules: ["security/no-hardcoded-secrets"],
						},
					},
				})
			);
		});

		it("loads config from package.json nestjs-doctor key", async () => {
			const config = await loadConfig(packageJsonDirectory);
			expect(config.ignore).toEqual({
				rules: ["security/no-hardcoded-secrets"],
			});
		});
	});

	describe("config file takes precedence", () => {
		let precedenceDirectory: string;

		beforeAll(() => {
			precedenceDirectory = path.join(tempRootDirectory, "precedence");
			fs.mkdirSync(precedenceDirectory, { recursive: true });
			fs.writeFileSync(
				path.join(precedenceDirectory, "nestjs-doctor.config.json"),
				JSON.stringify({
					ignore: { rules: ["from-config-file"] },
				})
			);
			fs.writeFileSync(
				path.join(precedenceDirectory, "package.json"),
				JSON.stringify({
					name: "test",
					"nestjs-doctor": {
						ignore: { rules: ["from-package-json"] },
					},
				})
			);
		});

		it("prefers nestjs-doctor.config.json over package.json", async () => {
			const config = await loadConfig(precedenceDirectory);
			expect(config.ignore?.rules).toEqual(["from-config-file"]);
		});
	});

	describe("no config", () => {
		let emptyDirectory: string;

		beforeAll(() => {
			emptyDirectory = path.join(tempRootDirectory, "no-config");
			fs.mkdirSync(emptyDirectory, { recursive: true });
		});

		it("returns defaults when no config is found", async () => {
			const config = await loadConfig(emptyDirectory);
			expect(config.include).toEqual(DEFAULT_CONFIG.include);
			expect(config.exclude).toEqual(DEFAULT_CONFIG.exclude);
			expect(config.ignore).toBeUndefined();
		});
	});

	describe("merges user excludes with defaults", () => {
		let mergeDirectory: string;

		beforeAll(() => {
			mergeDirectory = path.join(tempRootDirectory, "merge-excludes");
			fs.mkdirSync(mergeDirectory, { recursive: true });
			fs.writeFileSync(
				path.join(mergeDirectory, "nestjs-doctor.config.json"),
				JSON.stringify({
					exclude: ["**/custom-excluded/**"],
				})
			);
		});

		it("appends user excludes to defaults", async () => {
			const config = await loadConfig(mergeDirectory);
			expect(config.exclude).toEqual([
				...(DEFAULT_CONFIG.exclude ?? []),
				"**/custom-excluded/**",
			]);
		});
	});

	describe("minScore from nestjs-doctor.config.json", () => {
		let minScoreDirectory: string;

		beforeAll(() => {
			minScoreDirectory = path.join(tempRootDirectory, "with-min-score");
			fs.mkdirSync(minScoreDirectory, { recursive: true });
			fs.writeFileSync(
				path.join(minScoreDirectory, "nestjs-doctor.config.json"),
				JSON.stringify({
					minScore: 80,
				})
			);
		});

		it("loads minScore from config file", async () => {
			const config = await loadConfig(minScoreDirectory);
			expect(config.minScore).toBe(80);
		});
	});

	describe("minScore from package.json", () => {
		let pkgMinScoreDirectory: string;

		beforeAll(() => {
			pkgMinScoreDirectory = path.join(tempRootDirectory, "with-pkg-min-score");
			fs.mkdirSync(pkgMinScoreDirectory, { recursive: true });
			fs.writeFileSync(
				path.join(pkgMinScoreDirectory, "package.json"),
				JSON.stringify({
					name: "test-min-score",
					"nestjs-doctor": {
						minScore: 70,
					},
				})
			);
		});

		it("loads minScore from package.json", async () => {
			const config = await loadConfig(pkgMinScoreDirectory);
			expect(config.minScore).toBe(70);
		});
	});

	describe("minScore undefined when not configured", () => {
		let noMinScoreDirectory: string;

		beforeAll(() => {
			noMinScoreDirectory = path.join(tempRootDirectory, "no-min-score");
			fs.mkdirSync(noMinScoreDirectory, { recursive: true });
		});

		it("returns undefined minScore when not in config", async () => {
			const config = await loadConfig(noMinScoreDirectory);
			expect(config.minScore).toBeUndefined();
		});
	});

	describe("ignore config alongside other options", () => {
		let optionsDirectory: string;

		beforeAll(() => {
			optionsDirectory = path.join(
				tempRootDirectory,
				"with-ignore-and-options"
			);
			fs.mkdirSync(optionsDirectory, { recursive: true });
			fs.writeFileSync(
				path.join(optionsDirectory, "nestjs-doctor.config.json"),
				JSON.stringify({
					ignore: {
						rules: ["architecture/no-orm-in-services"],
						files: ["src/generated/**"],
					},
					rules: {
						"architecture/prefer-interface-injection": false,
					},
					thresholds: {
						godServiceMethods: 15,
					},
				})
			);
		});

		it("loads ignore config alongside rules and thresholds", async () => {
			const config = await loadConfig(optionsDirectory);
			expect(config.ignore).toEqual({
				rules: ["architecture/no-orm-in-services"],
				files: ["src/generated/**"],
			});
			expect(config.rules).toEqual({
				"architecture/prefer-interface-injection": false,
			});
			expect(config.thresholds).toEqual({
				godServiceMethods: 15,
			});
		});
	});
});
