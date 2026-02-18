"use client";

import { useEffect, useState } from "react";

const PERFECT_SCORE = 100;
const SCORE_GOOD_THRESHOLD = 75;
const SCORE_OK_THRESHOLD = 50;
const SCORE_BAR_WIDTH = 30;
const SCORE_FRAME_COUNT = 20;
const SCORE_FRAME_DELAY_MS = 30;

const easeOutCubic = (progress: number) => 1 - (1 - progress) ** 3;

const getScoreColorClass = (score: number): string => {
	if (score >= SCORE_GOOD_THRESHOLD) {
		return "text-green-400";
	}
	if (score >= SCORE_OK_THRESHOLD) {
		return "text-yellow-500";
	}
	return "text-red-400";
};

const getScoreLabel = (score: number): string => {
	if (score >= SCORE_GOOD_THRESHOLD) {
		return "Great";
	}
	if (score >= SCORE_OK_THRESHOLD) {
		return "Needs work";
	}
	return "Critical";
};

const ScoreBar = ({ score }: { score: number }) => {
	const filledCount = Math.round((score / PERFECT_SCORE) * SCORE_BAR_WIDTH);
	const emptyCount = SCORE_BAR_WIDTH - filledCount;
	const colorClass = getScoreColorClass(score);

	return (
		<>
			<span className={colorClass}>{"\u2588".repeat(filledCount)}</span>
			<span className="text-neutral-600">{"\u2591".repeat(emptyCount)}</span>
		</>
	);
};

const AnimatedScore = ({ targetScore }: { targetScore: number }) => {
	const [animatedScore, setAnimatedScore] = useState(0);

	useEffect(() => {
		let cancelled = false;
		let frame = 0;

		const animate = () => {
			if (cancelled || frame > SCORE_FRAME_COUNT) {
				return;
			}
			setAnimatedScore(
				Math.round(easeOutCubic(frame / SCORE_FRAME_COUNT) * targetScore)
			);
			frame++;
			setTimeout(animate, SCORE_FRAME_DELAY_MS);
		};

		animate();
		return () => {
			cancelled = true;
		};
	}, [targetScore]);

	const colorClass = getScoreColorClass(animatedScore);

	return (
		<>
			<div className="mb-2 pl-2">
				<span className={colorClass}>{animatedScore}</span>
				{` / ${PERFECT_SCORE}  `}
				<span className={colorClass}>{getScoreLabel(animatedScore)}</span>
			</div>
			<div className="mb-6 pl-2">
				<ScoreBar score={animatedScore} />
			</div>
		</>
	);
};

export default AnimatedScore;
