import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { glob } from "tinyglobby";
import type { ProjectInfo } from "../common/result.js";
import { installedVersion } from "./advisories/installed.js";

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

const NATIVE_SEPARATOR_RE = /\\/g;

/** Project roots are posix, whatever separators `relative()` returned. */
const toProjectRoot = (path: string): string =>
	path.replace(NATIVE_SEPARATOR_RE, "/");

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

async function resolveWorkspaceProjects(
	targetPath: string,
	patterns: string[]
): Promise<MonorepoInfo | null> {
	const pkgGlobs = patterns.map((p) => `${p}/package.json`);
	const pkgPaths = await glob(pkgGlobs, {
		cwd: targetPath,
		absolute: true,
		ignore: ["**/node_modules/**"],
	});

	const projects = new Map<string, string>();

	for (const pkgPath of pkgPaths) {
		try {
			const raw = await readFile(pkgPath, "utf-8");
			const pkg = JSON.parse(raw) as PackageJson;

			if (hasNestDependency(pkg)) {
				const projectDir = dirname(pkgPath);
				const relativePath = toProjectRoot(relative(targetPath, projectDir));
				setUniqueProject(projects, pkg.name ?? relativePath, relativePath);
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

	return resolveWorkspaceProjects(targetPath, patterns);
}

export function parsePackageJsonWorkspaces(
	pkg: Record<string, unknown>
): string[] {
	const workspaces = pkg.workspaces;
	if (!workspaces) {
		return [];
	}

	// Array format: "workspaces": ["apps/*", "packages/*"]
	if (Array.isArray(workspaces)) {
		return workspaces.filter((w): w is string => typeof w === "string");
	}

	// Yarn object format: "workspaces": { "packages": ["apps/*", "packages/*"] }
	if (typeof workspaces === "object" && workspaces !== null) {
		const obj = workspaces as Record<string, unknown>;
		if (Array.isArray(obj.packages)) {
			return obj.packages.filter((w): w is string => typeof w === "string");
		}
	}

	return [];
}

async function detectNpmYarnWorkspaceMonorepo(
	targetPath: string
): Promise<MonorepoInfo | null> {
	const pkgPath = join(targetPath, "package.json");

	let raw: string;
	try {
		raw = await readFile(pkgPath, "utf-8");
	} catch {
		return null;
	}

	const pkg = JSON.parse(raw) as Record<string, unknown>;
	const patterns = parsePackageJsonWorkspaces(pkg);
	if (patterns.length === 0) {
		return null;
	}

	return resolveWorkspaceProjects(targetPath, patterns);
}

interface LernaJson {
	packages?: string[];
	useWorkspaces?: boolean;
}

async function detectLernaMonorepo(
	targetPath: string
): Promise<MonorepoInfo | null> {
	const lernaPath = join(targetPath, "lerna.json");

	let raw: string;
	try {
		raw = await readFile(lernaPath, "utf-8");
	} catch {
		return null;
	}

	const config = JSON.parse(raw) as LernaJson;

	// If useWorkspaces is true, npm/yarn workspace detection already handles it
	if (config.useWorkspaces) {
		return null;
	}

	const patterns = config.packages ?? ["packages/*"];
	if (patterns.length === 0) {
		return null;
	}

	return resolveWorkspaceProjects(targetPath, patterns);
}

/**
 * Records a project under `name`, falling back to its root when that name is
 * taken. Two projects may share a name, and the root is unique by construction.
 */
function setUniqueProject(
	projects: Map<string, string>,
	name: string,
	relativePath: string
): void {
	const key = projects.has(name) ? relativePath : name;
	projects.set(key, relativePath);
}

/**
 * True when the directory holds a NestJS module file. Nx projects declare their
 * dependencies in the workspace root, so a package.json is often absent — and
 * Angular projects in the same workspace also use `*.module.ts`, so the import
 * is what tells them apart.
 */
async function containsNestModule(projectDir: string): Promise<boolean> {
	const moduleFiles = await glob(["**/*.module.ts"], {
		cwd: projectDir,
		absolute: true,
		ignore: ["**/node_modules/**"],
	});

	for (const file of moduleFiles) {
		try {
			const text = await readFile(file, "utf-8");
			if (text.includes("@nestjs/common")) {
				return true;
			}
		} catch {
			// Unreadable — try the next one
		}
	}

	return false;
}

async function detectNxMonorepo(
	targetPath: string
): Promise<MonorepoInfo | null> {
	const nxPath = join(targetPath, "nx.json");

	try {
		await readFile(nxPath, "utf-8");
	} catch {
		return null;
	}

	const projectJsonPaths = await glob(["**/project.json"], {
		cwd: targetPath,
		absolute: true,
		ignore: ["node_modules/**"],
	});

	const projects = new Map<string, string>();

	for (const projectJsonPath of projectJsonPaths) {
		const projectDir = dirname(projectJsonPath);
		const relativePath = toProjectRoot(relative(targetPath, projectDir));

		// Skip root-level project.json
		if (relativePath === "") {
			continue;
		}

		let pkg: PackageJson | undefined;
		try {
			pkg = JSON.parse(
				await readFile(join(projectDir, "package.json"), "utf-8")
			) as PackageJson;
		} catch {
			// Nx projects commonly have no package.json of their own
		}

		if (pkg && hasNestDependency(pkg)) {
			setUniqueProject(projects, pkg.name ?? relativePath, relativePath);
			continue;
		}

		if (await containsNestModule(projectDir)) {
			// Nx names the project in project.json, which is the only name it has
			// when there is no package.json.
			let nxName: string | undefined;
			try {
				nxName = (
					JSON.parse(await readFile(projectJsonPath, "utf-8")) as {
						name?: string;
					}
				).name;
			} catch {
				// Unreadable — fall back to the path
			}
			setUniqueProject(
				projects,
				pkg?.name ?? nxName ?? relativePath,
				relativePath
			);
		}
	}

	if (projects.size === 0) {
		return null;
	}

	return { projects };
}

async function hasPnpmWorkspace(targetPath: string): Promise<boolean> {
	try {
		await readFile(join(targetPath, "pnpm-workspace.yaml"), "utf-8");
		return true;
	} catch {
		return false;
	}
}

export async function detectMonorepo(
	targetPath: string
): Promise<MonorepoInfo | null> {
	// 1. Try nest-cli.json (highest priority — explicit NestJS config)
	const nestMonorepo = await detectNestCliMonorepo(targetPath);
	if (nestMonorepo) {
		return nestMonorepo;
	}

	// 2. Try pnpm-workspace.yaml (pnpm / Turborepo+pnpm)
	const pnpmMonorepo = await detectPnpmWorkspaceMonorepo(targetPath);
	if (pnpmMonorepo) {
		return pnpmMonorepo;
	}

	// 3. Try package.json workspaces (npm / yarn / Turborepo+npm/yarn / Lerna)
	// Skip if pnpm-workspace.yaml exists (pnpm repos may duplicate the field)
	if (!(await hasPnpmWorkspace(targetPath))) {
		const npmYarnMonorepo = await detectNpmYarnWorkspaceMonorepo(targetPath);
		if (npmYarnMonorepo) {
			return npmYarnMonorepo;
		}
	}

	// 4. Try nx.json (Nx fallback)
	const nxMonorepo = await detectNxMonorepo(targetPath);
	if (nxMonorepo) {
		return nxMonorepo;
	}

	// 5. Try lerna.json (standalone Lerna without useWorkspaces)
	return detectLernaMonorepo(targetPath);
}

export async function looksLikeMonorepo(targetPath: string): Promise<boolean> {
	const indicators = [
		"lerna.json",
		"turbo.json",
		"nx.json",
		"pnpm-workspace.yaml",
	];

	for (const file of indicators) {
		try {
			await readFile(join(targetPath, file), "utf-8");
			return true;
		} catch {
			// Continue checking
		}
	}

	// Check package.json workspaces field
	try {
		const raw = await readFile(join(targetPath, "package.json"), "utf-8");
		const pkg = JSON.parse(raw) as Record<string, unknown>;
		if (pkg.workspaces) {
			return true;
		}
	} catch {
		// No package.json
	}

	return false;
}

/**
 * Reads the nearest `package.json` at or above `targetPath`, stopping at the
 * repository root so a scan never adopts an unrelated parent's manifest.
 */
async function readNearestPackageJson(
	targetPath: string
): Promise<PackageJson> {
	let current = resolve(targetPath);

	for (;;) {
		try {
			const raw = await readFile(join(current, "package.json"), "utf-8");
			return JSON.parse(raw) as PackageJson;
		} catch {
			// Keep walking.
		}

		if (existsSync(join(current, ".git"))) {
			return {};
		}

		const parent = dirname(current);
		if (parent === current) {
			return {};
		}
		current = parent;
	}
}

export async function detectProject(targetPath: string): Promise<ProjectInfo> {
	const pkg = await readNearestPackageJson(targetPath);

	const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };

	// The install is what actually runs, so it wins over the declared range.
	const nestVersion =
		installedVersion(targetPath, "@nestjs/core") ??
		extractVersion(allDeps["@nestjs/core"]);
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
