import {
	PERFECT_SCORE,
	palette,
	SCORE_BAR_WIDTH,
	scoreColor,
} from "@/lib/tui-theme";

/** The block/shade score gauge shared by the leaderboard and the share screen. */
export const ScoreBar = ({ score }: { score: number }) => {
	const safeScore = Math.max(0, Math.min(PERFECT_SCORE, score));
	const filled = Math.round((safeScore / PERFECT_SCORE) * SCORE_BAR_WIDTH);
	return (
		<div className="whitespace-pre">
			<span style={{ color: scoreColor(safeScore) }}>{"█".repeat(filled)}</span>
			<span style={{ color: palette.dim }}>
				{"░".repeat(SCORE_BAR_WIDTH - filled)}
			</span>
		</div>
	);
};
