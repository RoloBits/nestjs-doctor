import { readFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { glob } from "tinyglobby";
import type { ProjectInfo } from "../common/result.js";

interface PackageJson {
	dependencies?: Record<string, string>;
	devDependencies?: Record<string, string>;
	name?: string;
	peerDependencies?: Record<string, string>;
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

const PACKAGES_KEY_RE = /^packages\s*:/;
const PACKAGES_INLINE_RE = /^packages\s*:\s*\[(.+)\]/;
const TOP_LEVEL_KEY_RE = /^\S/;
const LIST_ITEM_RE = /^-\s+['"]?([^'"]+)['"]?\s*$/;
const QUOTE_STRIP_RE = /^['"]|['"]$/g;
export function parseWorkspacePatterns(content: string): string[] {
	const patterns: string[] = [];
	const lines = content.split("\n");
	let inPackages = false;

	for (const line of lines) {
		const trimmed = line.trim();

		if (PACKAGES_KEY_RE.test(trimmed)) {
			// Check for inline array: packages: ["apps/*", "packages/*"]
			const inlineMatch = trimmed.match(PACKAGES_INLINE_RE);
			if (inlineMatch) {
				for (const item of inlineMatch[1].split(",")) {
					const cleaned = item.trim().replace(QUOTE_STRIP_RE, "");
					if (cleaned) {
						patterns.push(cleaned);
					}
				}
				return patterns;
			}
			inPackages = true;
			continue;
		}

		if (inPackages) {
			// Stop at next top-level key or empty content
			if (TOP_LEVEL_KEY_RE.test(line) && trimmed !== "") {
				break;
			}

			// Parse list item: - "apps/*" or - 'apps/*' or - apps/*
			const itemMatch = trimmed.match(LIST_ITEM_RE);
			if (itemMatch) {
				patterns.push(itemMatch[1]);
			}
		}
	}

	return patterns;
}

async function detectNestCliMonorepo(
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

function hasNestDependency(pkg: PackageJson): boolean {
	const allDeps = {
		...pkg.dependencies,
		...pkg.devDependencies,
		...pkg.peerDependencies,
	};
	return Boolean(allDeps["@nestjs/core"] || allDeps["@nestjs/common"]);
}

async function detectPnpmWorkspaceMonorepo(
	targetPath: string
): Promise<MonorepoInfo | null> {
	const workspacePath = join(targetPath, "pnpm-workspace.yaml");

	let content: string;
	try {
		content = await readFile(workspacePath, "utf-8");
	} catch {
		return null;
	}

	const patterns = parseWorkspacePatterns(content);
	if (patterns.length === 0) {
		return null;
	}

	const pkgGlobs = patterns.map((p) => `${p}/package.json`);
	const pkgPaths = await glob(pkgGlobs, {
		cwd: targetPath,
		absolute: true,
	});

	const projects = new Map<string, string>();

	for (const pkgPath of pkgPaths) {
		try {
			const raw = await readFile(pkgPath, "utf-8");
			const pkg = JSON.parse(raw) as PackageJson;

			if (hasNestDependency(pkg)) {
				const projectDir = dirname(pkgPath);
				const relativePath = relative(targetPath, projectDir);
				const name = pkg.name ?? relativePath;
				projects.set(name, relativePath);
			}
		} catch {
			// Skip unreadable package.json
		}
	}

	if (projects.size === 0) {
		return null;
	}

	return { projects };
}

export async function detectMonorepo(
	targetPath: string
): Promise<MonorepoInfo | null> {
	// 1. Try nest-cli.json (existing, backward-compatible)
	const nestMonorepo = await detectNestCliMonorepo(targetPath);
	if (nestMonorepo) {
		return nestMonorepo;
	}

	// 2. Try pnpm-workspace.yaml (Turborepo / pnpm workspace support)
	return detectPnpmWorkspaceMonorepo(targetPath);
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
