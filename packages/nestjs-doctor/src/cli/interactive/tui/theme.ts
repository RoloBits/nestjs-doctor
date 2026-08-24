/**
 * Terminal translation of the site and report palette: pure black surfaces,
 * hairline borders, nest red as the only accent, severity red/amber/blue.
 */
export const palette = {
	nestRed: "#ea2845",
	bright: "#f2f1ef",
	text: "#e8e8e8",
	muted: "#888888",
	dim: "#666666",
	border: "#3a3a3a",
	borderStrong: "#4d4d4d",
	/** nest red at roughly 10% over black, for the selected row wash. */
	washRed: "#1f0c10",
	error: "#ef4444",
	warning: "#f59e0b",
	info: "#3b82f6",
	success: "#4ade80",
} as const;

export const severityColor = (
	severity: "error" | "warning" | "info"
): string => {
	if (severity === "error") {
		return palette.error;
	}
	if (severity === "warning") {
		return palette.warning;
	}
	return palette.info;
};

export const SEVERITY_MARK: Record<"error" | "warning" | "info", string> = {
	error: "✗",
	warning: "⚠",
	info: "●",
};

const SCORE_GOOD_THRESHOLD = 75;
const SCORE_OK_THRESHOLD = 50;

export const scoreColor = (score: number): string => {
	if (score >= SCORE_GOOD_THRESHOLD) {
		return palette.success;
	}
	if (score >= SCORE_OK_THRESHOLD) {
		return palette.warning;
	}
	return palette.error;
};

export const getStarRating = (score: number): string => {
	if (score >= 90) {
		return "★★★★★";
	}
	if (score >= 75) {
		return "★★★★☆";
	}
	if (score >= 50) {
		return "★★★☆☆";
	}
	if (score >= 25) {
		return "★★☆☆☆";
	}
	return "★☆☆☆☆";
};

export const getNestBirds = (
	score: number
): { eyes: string; color: string } => {
	if (score >= SCORE_GOOD_THRESHOLD) {
		return { color: palette.success, eyes: "◠ ◠ ◠" };
	}
	if (score >= SCORE_OK_THRESHOLD) {
		return { color: palette.warning, eyes: "• • •" };
	}
	return { color: palette.error, eyes: "x x x" };
};
