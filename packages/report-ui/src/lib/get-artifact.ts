import type { ReportArtifact } from "./model/artifact";

/**
 * Reads the report artifact injected by buildHtmlReport as a JSON script
 * block. In dev, falls back to a committed fixture so `next dev` works
 * without a CLI run.
 */
export async function loadArtifact(): Promise<ReportArtifact> {
	const raw = document.getElementById("nd-report")?.textContent;
	if (raw) {
		return JSON.parse(raw) as ReportArtifact;
	}
	if (process.env.NODE_ENV !== "production") {
		const { default: demo } = await import("./demo-artifact.json");
		return demo as ReportArtifact;
	}
	throw new Error("no embedded #nd-report block found");
}
