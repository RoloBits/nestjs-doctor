const BACKSLASH_RE = /\\/g;
const DRIVE_RE = /^([a-zA-Z]):/;

/**
 * One spelling of a path for the cache. The scanner reports forward slashes
 * while the editor sends native ones, so on Windows the same file arrives as
 * both D:/proj/a.ts and D:\proj\a.ts.
 */
export function toCacheKey(filePath: string): string {
	const posix = filePath.replace(BACKSLASH_RE, "/");
	return posix.replace(
		DRIVE_RE,
		(_match, letter: string) => `${letter.toLowerCase()}:`
	);
}

/** Per-file findings from the last scan that touched each file. */
export class DiagnosticCache {
	private readonly byFile = new Map<string, unknown[]>();

	set(filePath: string, diagnostics: unknown[]): void {
		this.byFile.set(toCacheKey(filePath), diagnostics);
	}

	clear(): void {
		this.byFile.clear();
	}

	/** Replaces everything, grouping a full scan's findings by their file. */
	replaceAll(diagnostics: Array<{ filePath?: string }>): void {
		this.byFile.clear();
		for (const diagnostic of diagnostics) {
			const key = toCacheKey(diagnostic.filePath ?? "");
			let list = this.byFile.get(key);
			if (!list) {
				list = [];
				this.byFile.set(key, list);
			}
			list.push(diagnostic);
		}
	}

	/** Every cached file finding, followed by the project-wide ones. */
	withProject(projectDiagnostics: unknown[]): unknown[] {
		const all: unknown[] = [];
		for (const diagnostics of this.byFile.values()) {
			all.push(...diagnostics);
		}
		all.push(...projectDiagnostics);
		return all;
	}

	get size(): number {
		return this.byFile.size;
	}
}

/**
 * Whether a startup failure is the analyzer being absent from the workspace,
 * which the user fixes by installing it, rather than a fault to report.
 */
export function isMissingAnalyzer(message: string): boolean {
	return (
		message.includes("Cannot find module 'nestjs-doctor'") ||
		message.includes('Cannot find module "nestjs-doctor"')
	);
}
