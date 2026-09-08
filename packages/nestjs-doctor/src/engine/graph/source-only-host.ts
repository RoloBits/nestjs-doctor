import { realpathSync } from "node:fs";
import type { FileSystemHost } from "ts-morph";
import { Project } from "ts-morph";

const NODE_MODULES = /[\\/]node_modules[\\/]/;
/** `node_modules/name` or `node_modules/@scope/name`, whichever the path has. */
const PACKAGE_ROOT = /^(.*[\\/]node_modules[\\/](?:@[^\\/]+[\\/])?[^\\/]+)/;

/** The shape ts-morph recognises as a missing file. */
function notFound(filePath: string): Error {
	return Object.assign(new Error(`${filePath} not found`), { code: "ENOENT" });
}

const HIDDEN_READS = new Set([
	"directoryExists",
	"directoryExistsSync",
	"fileExists",
	"fileExistsSync",
	"readFile",
	"readFileSync",
]);

/** True when the path resolves inside node_modules, or resolves to nothing. */
function installedPackage(filePath: string, cache: Map<string, boolean>) {
	const root = PACKAGE_ROOT.exec(filePath)?.[1];
	if (!root) {
		return NODE_MODULES.test(filePath);
	}
	const cached = cache.get(root);
	if (cached !== undefined) {
		return cached;
	}
	let installed: boolean;
	try {
		installed = NODE_MODULES.test(realpathSync(root));
	} catch {
		installed = true;
	}
	cache.set(root, installed);
	return installed;
}

/**
 * A file system that reports installed packages as absent. A file the scan
 * collected stays readable.
 */
export function createSourceOnlyHost(collected: Iterable<string>) {
	const real = new Project({
		skipAddingFilesFromTsConfig: true,
	}).getFileSystem();
	const keep = new Set(collected);
	const roots = new Map<string, boolean>();
	const hidden = (filePath: string) =>
		!keep.has(filePath) &&
		NODE_MODULES.test(filePath) &&
		installedPackage(filePath, roots);

	return new Proxy(real, {
		get(target, property, receiver) {
			const value = Reflect.get(target, property, receiver);
			if (typeof value !== "function" || !HIDDEN_READS.has(String(property))) {
				return typeof value === "function" ? value.bind(target) : value;
			}
			return (filePath: string, ...rest: unknown[]) => {
				if (!hidden(filePath)) {
					return Reflect.apply(value, target, [filePath, ...rest]);
				}
				if (property === "readFile") {
					return Promise.reject(notFound(filePath));
				}
				if (property === "readFileSync") {
					throw notFound(filePath);
				}
				return property === "fileExists" || property === "directoryExists"
					? Promise.resolve(false)
					: false;
			};
		},
	}) as FileSystemHost;
}
