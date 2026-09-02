/** The TUI palette: black surfaces, hairline borders, nest red as the accent. */
export const palette = {
	nestRed: "#ea2845",
	bright: "#f2f1ef",
	text: "#e8e8e8",
	muted: "#888888",
	dim: "#666666",
	border: "#3a3a3a",
	washRed: "#1f0c10",
	error: "#ef4444",
	warning: "#f59e0b",
	info: "#3b82f6",
	success: "#4ade80",
} as const;

export const PERFECT_SCORE = 100;
export const SCORE_BAR_WIDTH = 30;
const SCORE_GOOD_THRESHOLD = 75;
const SCORE_OK_THRESHOLD = 50;

export const scoreColor = (score: number): string => {
	if (score >= SCORE_GOOD_THRESHOLD) {
		return palette.success;
	}
	if (score >= SCORE_OK_THRESHOLD) {
		return palette.warning;
	}
	return palette.error;
};

export const SCORE_TIERS: { label: string; minimum: number; stars: string }[] =
	[
		{ minimum: 90, stars: "★★★★★", label: "Excellent" },
		{ minimum: 75, stars: "★★★★☆", label: "Good" },
		{ minimum: 50, stars: "★★★☆☆", label: "Fair" },
		{ minimum: 25, stars: "★★☆☆☆", label: "Poor" },
		{ minimum: 0, stars: "★☆☆☆☆", label: "Critical" },
	];

export const scoreTier = (score: number) =>
	SCORE_TIERS.find((tier) => score >= tier.minimum) ?? SCORE_TIERS[0];

/** The two inner lines of the ASCII face the console reporter prints. */
export const getNestBirds = (score: number): [string, string] => {
	if (score >= SCORE_GOOD_THRESHOLD) {
		return ["◠ ◠ ◠", "╰───╯"];
	}
	if (score >= SCORE_OK_THRESHOLD) {
		return ["• • •", "╰───╯"];
	}
	return ["x x x", "╰───╯"];
};

/** The TUI menu box: red border when focused, hairline when not. */
export const MENU_CLASS = "flex flex-col border";
export const MENU_LIST_CLASS = "flex flex-col border border-white/15";
export const MENU_ROW_CLASS =
	"flex w-full items-baseline gap-3 py-1 pr-3 text-left transition-colors focus:outline-none focus-visible:outline-none";
