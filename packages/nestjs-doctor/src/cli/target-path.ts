import { existsSync, statSync } from "node:fs";

/**
 * Error message when the path cannot be scanned, null when it can. A path that
 * is missing or is not a directory collects no files, which reads as a clean scan.
 */
export const validateTargetPathArg = (targetPath: string): string | null => {
	if (!existsSync(targetPath)) {
		return `Path does not exist: ${targetPath}`;
	}

	if (!statSync(targetPath).isDirectory()) {
		return `Path is not a directory: ${targetPath}`;
	}

	return null;
};
