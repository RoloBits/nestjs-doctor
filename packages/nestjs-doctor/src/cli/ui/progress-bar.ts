const BAR_WIDTH = 20;

/** A fixed-width unicode bar with the running count: `████░░░… 132/354`. */
export const renderProgressBar = (done: number, total: number): string => {
	const filled =
		total > 0 ? Math.min(BAR_WIDTH, Math.round((done / total) * BAR_WIDTH)) : 0;
	return `${"█".repeat(filled)}${"░".repeat(BAR_WIDTH - filled)} ${done}/${total}`;
};
