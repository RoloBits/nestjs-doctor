import { execSync } from "node:child_process";

/** Whether a binary resolves on PATH, via `which` or `where`. */
export const isCommandAvailable = (command: string): boolean => {
	try {
		const probe =
			process.platform === "win32" ? `where ${command}` : `which ${command}`;
		execSync(probe, { stdio: "ignore" });
		return true;
	} catch {
		return false;
	}
};
