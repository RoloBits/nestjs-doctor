import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ProjectInfo } from "../types/result.js";

interface PackageJson {
	dependencies?: Record<string, string>;
	devDependencies?: Record<string, string>;
	name?: string;
}

interface NestCliProject {
	compilerOptions?: Record<string, unknown>;
	entryFile?: string;
	root?: string;
	sourceRoot?: string;
	type?: string;
}

interface NestCliJson {
	monorepo?: boolean;
	projects?: Record<string, NestCliProject>;
	root?: string;
	sourceRoot?: string;
}

export interface MonorepoInfo {
	projects: Map<string, string>; // name -> root path (relative)
}

export async function detectMonorepo(
	targetPath: string
): Promise<MonorepoInfo | null> {
	const cliPath = join(targetPath, "nest-cli.json");

	try {
		const raw = await readFile(cliPath, "utf-8");
		const config = JSON.parse(raw) as NestCliJson;

		if (!(config.monorepo && config.projects)) {
			return null;
		}

		const projects = new Map<string, string>();
		for (const [name, project] of Object.entries(config.projects)) {
			const root = project.root ?? name;
			projects.set(name, root);
		}

		if (projects.size === 0) {
			return null;
		}

		return { projects };
	} catch {
		return null;
	}
}

export async function detectProject(targetPath: string): Promise<ProjectInfo> {
	const pkgPath = join(targetPath, "package.json");
	let pkg: PackageJson = {};

	try {
		const raw = await readFile(pkgPath, "utf-8");
		pkg = JSON.parse(raw) as PackageJson;
	} catch {
		// No package.json found — use defaults
	}

	const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };

	const nestVersion = extractVersion(allDeps["@nestjs/core"]);
	const orm = detectOrm(allDeps);
	const framework = detectFramework(allDeps);

	return {
		name: pkg.name ?? "unknown",
		nestVersion,
		orm,
		framework,
		moduleCount: 0,
		fileCount: 0,
	};
}

function extractVersion(version: string | undefined): string | null {
	if (!version) {
		return null;
	}
	return version.replace(/[\^~>=<]/g, "");
}

function detectOrm(deps: Record<string, string>): string | null {
	if (deps["@prisma/client"]) {
		return "prisma";
	}
	if (deps.typeorm) {
		return "typeorm";
	}
	if (deps["@mikro-orm/core"]) {
		return "mikro-orm";
	}
	if (deps.sequelize) {
		return "sequelize";
	}
	if (deps.mongoose) {
		return "mongoose";
	}
	if (deps["drizzle-orm"]) {
		return "drizzle";
	}
	return null;
}

function detectFramework(
	deps: Record<string, string>
): "express" | "fastify" | null {
	if (deps["@nestjs/platform-fastify"]) {
		return "fastify";
	}
	if (deps["@nestjs/platform-express"]) {
		return "express";
	}
	// Default NestJS uses express
	if (deps["@nestjs/core"]) {
		return "express";
	}
	return null;
}
