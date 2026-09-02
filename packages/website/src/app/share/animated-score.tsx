"use client";

import { useEffect, useState } from "react";
import { ScoreBar } from "@/components/score-bar";
import { PERFECT_SCORE, palette, scoreColor, scoreTier } from "@/lib/tui-theme";

const SCORE_FRAME_COUNT = 20;
const SCORE_FRAME_DELAY_MS = 30;
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

const easeOutCubic = (progress: number) => 1 - (1 - progress) ** 3;

/** The console reporter's score line, counted up unless motion is reduced.
 * A null target means the link carried no usable score. */
const AnimatedScore = ({ targetScore }: { targetScore: number | null }) => {
	const [score, setScore] = useState(0);

	useEffect(() => {
		if (targetScore === null) {
			return;
		}
		if (window.matchMedia(REDUCED_MOTION_QUERY).matches) {
			setScore(targetScore);
			return;
		}

		let cancelled = false;
		let frame = 0;
		let timer: ReturnType<typeof setTimeout>;

		const animate = () => {
			if (cancelled || frame > SCORE_FRAME_COUNT) {
				return;
			}
			setScore(
				Math.round(easeOutCubic(frame / SCORE_FRAME_COUNT) * targetScore)
			);
			frame++;
			timer = setTimeout(animate, SCORE_FRAME_DELAY_MS);
		};

		animate();
		return () => {
			cancelled = true;
			clearTimeout(timer);
		};
	}, [targetScore]);

	if (targetScore === null) {
		return (
			<div>
				<div className="font-bold text-lg" style={{ color: palette.muted }}>
					{`--/${PERFECT_SCORE}`}
				</div>
				<ScoreBar score={0} />
			</div>
		);
	}

	const tier = scoreTier(score);

	return (
		<div>
			<div className="font-bold text-lg">
				<span style={{ color: scoreColor(score) }}>
					{`${score}/${PERFECT_SCORE} ${tier.stars}`}
				</span>
				<span
					className="whitespace-pre"
					style={{ color: palette.muted }}
				>{`  ${tier.label}`}</span>
			</div>
			<ScoreBar score={score} />
		</div>
	);
};

export default AnimatedScore;
