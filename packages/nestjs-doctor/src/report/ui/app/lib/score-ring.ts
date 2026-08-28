// Score → CSS color token, matching the thresholds used across the report.
export function getScoreColor(v: number): string {
	if (v >= 75) {
		return "var(--score-green)";
	}
	if (v >= 50) {
		return "var(--score-yellow)";
	}
	return "var(--score-red)";
}

// The score ring: a faint track, an arc proportional to the score, and the
// value centred in the score's color.
export function makeScoreRingSvg(
	size: number,
	strokeW: number,
	value: number
): string {
	const r = (size - strokeW) / 2;
	const c = 2 * Math.PI * r;
	const offset = c - (value / 100) * c;
	const color = getScoreColor(value);
	return (
		`<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">` +
		`<circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="rgba(255,255,255,0.15)" stroke-width="1"/>` +
		`<circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${color}" stroke-width="${strokeW}" stroke-linecap="butt" stroke-dasharray="${c}" stroke-dashoffset="${offset}" transform="rotate(-90 ${size / 2} ${size / 2})"/>` +
		`<text x="${size / 2}" y="${size / 2}" text-anchor="middle" dominant-baseline="central" fill="${color}" font-size="${Math.round(size * 0.32)}" font-weight="700" font-family="var(--font)">${value}</text>` +
		"</svg>"
	);
}
