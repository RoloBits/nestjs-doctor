const SEV_COLORS: Record<string, string> = {
	green: "var(--score-green)",
	yellow: "var(--score-yellow)",
	red: "var(--score-red)",
};

function scoreColor(value: number): string {
	if (value >= 75) {
		return SEV_COLORS.green;
	}
	if (value >= 50) {
		return SEV_COLORS.yellow;
	}
	return SEV_COLORS.red;
}

export function ScoreRing({
	size,
	strokeWidth,
	value,
}: {
	size: number;
	strokeWidth: number;
	value: number;
}) {
	const radius = (size - strokeWidth) / 2;
	const circumference = 2 * Math.PI * radius;
	const offset = circumference - (value / 100) * circumference;
	const color = scoreColor(value);
	return (
		<svg fill="none" height={size} viewBox={`0 0 ${size} ${size}`} width={size}>
			<title>{`Score ${value} out of 100`}</title>
			<circle
				cx={size / 2}
				cy={size / 2}
				r={radius}
				stroke="rgba(255,255,255,0.15)"
				strokeWidth="1"
			/>
			<circle
				cx={size / 2}
				cy={size / 2}
				r={radius}
				stroke={color}
				strokeDasharray={circumference}
				strokeDashoffset={offset}
				strokeLinecap="butt"
				strokeWidth={strokeWidth}
				transform={`rotate(-90 ${size / 2} ${size / 2})`}
			/>
			<text
				dominantBaseline="central"
				fill={color}
				fontSize={Math.round(size * 0.32)}
				fontWeight="700"
				textAnchor="middle"
				x={size / 2}
				y={size / 2}
			>
				{value}
			</text>
		</svg>
	);
}
