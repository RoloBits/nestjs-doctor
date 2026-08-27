interface ScoreRingProps {
	label: string;
	value: number;
}

const RADIUS = 52;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

function scoreColor(value: number): string {
	if (value >= 80) {
		return "#3fb950";
	}
	if (value >= 50) {
		return "#d29922";
	}
	return "#ea2845";
}

export function ScoreRing({ value, label }: ScoreRingProps) {
	const filled = (Math.max(0, Math.min(100, value)) / 100) * CIRCUMFERENCE;
	const color = scoreColor(value);
	return (
		<svg
			aria-label={`${label}: ${value} out of 100`}
			className="score-ring"
			height="96"
			role="img"
			viewBox="0 0 120 120"
			width="96"
		>
			<circle
				cx="60"
				cy="60"
				fill="none"
				r={RADIUS}
				stroke="var(--border)"
				strokeWidth="8"
			/>
			<circle
				cx="60"
				cy="60"
				fill="none"
				r={RADIUS}
				stroke={color}
				strokeDasharray={`${filled} ${CIRCUMFERENCE}`}
				strokeLinecap="round"
				strokeWidth="8"
				transform="rotate(-90 60 60)"
			/>
			<text
				fill={color}
				fontSize="26"
				fontWeight="600"
				textAnchor="middle"
				x="60"
				y="58"
			>
				{value}
			</text>
			<text
				fill="var(--text-dim)"
				fontSize="10"
				textAnchor="middle"
				x="60"
				y="76"
			>
				{label}
			</text>
		</svg>
	);
}
