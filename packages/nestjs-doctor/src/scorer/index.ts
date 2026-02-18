import type { Diagnostic } from "../types/diagnostic.js";
import type { Score } from "../types/result.js";
import { getScoreLabel } from "./labels.js";
import { CATEGORY_MULTIPLIERS, SEVERITY_WEIGHTS } from "./weights.js";

export function calculateScore(
	diagnostics: Diagnostic[],
	fileCount: number
): Score {
	if (fileCount === 0) {
		return { value: 100, label: getScoreLabel(100) };
	}

	let totalPenalty = 0;

	for (const d of diagnostics) {
		const severityWeight = SEVERITY_WEIGHTS[d.severity];
		const categoryMultiplier = CATEGORY_MULTIPLIERS[d.category];
		totalPenalty += severityWeight * categoryMultiplier;
	}

	// Normalize by file count so larger projects aren't penalized more
	const normalizedPenalty = totalPenalty / fileCount;

	// Convert to 0-100 scale
	// A penalty of ~10 per file should bring score close to 0
	const value = Math.max(
		0,
		Math.min(100, Math.round(100 - normalizedPenalty * 10))
	);

	return { value, label: getScoreLabel(value) };
}
