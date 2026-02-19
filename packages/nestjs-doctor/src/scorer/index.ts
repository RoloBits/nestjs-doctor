import type { Diagnostic } from "../types/diagnostic.js";
import type { Score } from "../types/result.js";
import { getScoreLabel } from "./labels.js";
import { CATEGORY_MULTIPLIERS, SEVERITY_WEIGHTS } from "./weights.js";

/**
 * Calculates a health score from 0-100 based on diagnostics and file count.
 *
 * Scoring formula: `score = 100 - (totalPenalty / fileCount) * PENALTY_SCALE`
 *
 * Each diagnostic contributes a penalty of `severityWeight * categoryMultiplier`:
 * - A security error costs 3.0 * 1.5 = 4.5 penalty points
 * - A performance info costs 0.5 * 0.8 = 0.4 penalty points
 *
 * The penalty is normalized by file count so that a 10-file project and a
 * 500-file project with the same issue density receive similar scores.
 *
 * PENALTY_SCALE (10) was calibrated so that an average of ~1 error per file
 * (normalized penalty ≈ 10) brings the score to 0. In practice:
 * - 1 error per 10 files → penalty/file ≈ 0.45 → score ≈ 95 (Excellent)
 * - 1 error per 3 files  → penalty/file ≈ 1.5  → score ≈ 85 (Good)
 * - 1 error per file     → penalty/file ≈ 4.5  → score ≈ 55 (Fair)
 * - 2 errors per file    → penalty/file ≈ 9.0  → score ≈ 10 (Critical)
 */
const PENALTY_SCALE = 10;

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

	const normalizedPenalty = totalPenalty / fileCount;
	const value = Math.max(
		0,
		Math.min(100, Math.round(100 - normalizedPenalty * PENALTY_SCALE))
	);

	return { value, label: getScoreLabel(value) };
}
