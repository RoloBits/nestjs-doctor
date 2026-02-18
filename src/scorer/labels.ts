export function getScoreLabel(score: number): string {
	if (score >= 90) return "Excellent";
	if (score >= 75) return "Good";
	if (score >= 50) return "Fair";
	if (score >= 25) return "Poor";
	return "Critical";
}
