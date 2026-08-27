export type ReportSection =
	| "summary"
	| "diagnosis"
	| "modules"
	| "endpoints"
	| "schema"
	| "lab";

declare global {
	interface Window {
		__ndTrack?: (name: string) => void;
	}
}

/** Optional analytics hook: silent unless the CLI embeds a beacon. */
export function track(name: string): void {
	window.__ndTrack?.(name);
}
