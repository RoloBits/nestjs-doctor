import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ProjectInfo } from "../types/result.js";

interface PackageJson {
	name?: string;
	dependencies?: Record<string, string>;
	devDependencies?: Record<string, string>;
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
	if (!version) return null;
	return version.replace(/[\^~>=<]/g, "");
}

function detectOrm(deps: Record<string, string>): string | null {
	if (deps["@prisma/client"]) return "prisma";
	if (deps["typeorm"]) return "typeorm";
	if (deps["@mikro-orm/core"]) return "mikro-orm";
	if (deps["sequelize"]) return "sequelize";
	if (deps["mongoose"]) return "mongoose";
	if (deps["drizzle-orm"]) return "drizzle";
	return null;
}

function detectFramework(
	deps: Record<string, string>,
): "express" | "fastify" | null {
	if (deps["@nestjs/platform-fastify"]) return "fastify";
	if (deps["@nestjs/platform-express"]) return "express";
	// Default NestJS uses express
	if (deps["@nestjs/core"]) return "express";
	return null;
}
