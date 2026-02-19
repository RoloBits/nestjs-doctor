export const validateMinScoreArg = (raw: string): string | null => {
	if (raw.trim() === "") {
		return `Invalid --min-score value: "${raw}". Must be an integer between 0 and 100.`;
	}

	const num = Number(raw);

	if (!Number.isInteger(num)) {
		return `Invalid --min-score value: "${raw}". Must be an integer between 0 and 100.`;
	}

	if (num < 0 || num > 100) {
		return `Invalid --min-score value: "${raw}". Must be an integer between 0 and 100.`;
	}

	return null;
};

export const resolveMinScore = (
	cliValue: string | undefined,
	configValue: number | undefined
): number | undefined => {
	if (cliValue !== undefined) {
		return Number(cliValue);
	}

	return configValue;
};

export const checkMinScore = (
	actualScore: number,
	minScore: number | undefined
): boolean => {
	if (minScore === undefined) {
		return true;
	}

	return actualScore >= minScore;
};
