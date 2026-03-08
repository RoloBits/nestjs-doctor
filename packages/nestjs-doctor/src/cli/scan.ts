import type { MonorepoInfo } from "../core/project-detector.js";
import {
	type MonorepoScanResult,
	type ScanResult,
	scan,
	scanMonorepo,
} from "../core/scanner.js";
import { highlighter } from "./ui/highlighter.js";
import { spinner } from "./ui/spinner.js";

/** Runs the scanner for a single NestJS project with spinner UX */
export const scanSingleProject = async (
	targetPath: string,
	configPath: string | undefined,
	isMachineReadable: boolean
): Promise<ScanResult> => {
	const progress = isMachineReadable ? null : spinner("Scanning...").start();

	const scanResult = await scan(targetPath, { config: configPath });

	if (progress) {
		const { project } = scanResult.result;
		const detailParts = [
			`Scanned ${highlighter.info(String(project.fileCount))} files`,
		];
		if (project.nestVersion) {
			detailParts.push(`NestJS ${highlighter.info(project.nestVersion)}`);
		}
		if (project.orm) {
			detailParts.push(highlighter.info(project.orm));
		}
		progress.succeed(detailParts.join(" | "));
	}

	return scanResult;
};

/** Runs the scanner for a NestJS monorepo with spinner UX */
export const scanMonorepoProject = async (
	targetPath: string,
	monorepo: MonorepoInfo,
	configPath: string | undefined,
	isMachineReadable: boolean
): Promise<MonorepoScanResult> => {
	const progress = isMachineReadable ? null : spinner("Scanning...").start();

	const monorepoResult = await scanMonorepo(targetPath, {
		config: configPath,
		monorepo,
	});

	if (progress) {
		const { result } = monorepoResult;
		const projectNames = result.subProjects.map((sp) => sp.name).join(", ");
		progress.succeed(
			`Scanned ${highlighter.info(String(result.combined.project.fileCount))} files across ${highlighter.info(String(result.subProjects.length))} projects (${projectNames})`
		);
	}

	return monorepoResult;
};
