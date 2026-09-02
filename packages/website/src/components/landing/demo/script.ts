import { easeOutCubic } from "@/lib/easing";

/** Everything printed is real output from scanning the bad-practices fixture. */
export const COMMAND = "npx -y nestjs-doctor@latest .";
export const AGENT_COMMAND = "claude";
export const PROMPT_TEXT = "Fix nestjs-doctor errors and warnings";
export const PROJECT_LINE = "Project: acme-api | NestJS 10.0.0 | 1 modules";
export const DIRTY_SCORE = 35;
export const CLEAN_SCORE = 100;

interface Finding {
	count?: number;
	message: string;
	severity: "error" | "warning";
}

export const FINDINGS: Finding[] = [
	{
		severity: "error",
		message: "Possible hardcoded Secret key detected.",
		count: 4,
	},
	{
		severity: "error",
		message:
			"Controller injects repository 'UsersRepository' directly. Use a service layer instead.",
	},
	{
		severity: "warning",
		message: "Constructor parameter 'usersService' should be readonly.",
		count: 3,
	},
	{
		severity: "warning",
		message: "Endpoint 'findAll' has no @UseGuards() at class or method level.",
		count: 2,
	},
	{
		severity: "warning",
		message:
			"Provider 'ConfigService' is never injected by any other provider or controller.",
	},
];

export const MASCOT = [
	"  ████████████  ",
	"  ██ ██████ ██  ",
	"████████████████",
	"  ████████████  ",
	"    █ █  █ █    ",
];

export const SPINNER = ["✻", "✽", "✢", "✳", "∗", "✢"];

export const DIFF = {
	file: "src/users/users.controller.ts",
	stat: "1 addition, 1 removal",
	removed: "- constructor(private usersRepo: UsersRepository) {}",
	added: "+ constructor(private readonly users: UsersService) {}",
};

export const CHAR_MS = 30;
export const PROMPT_CHAR_MS = 54;
const SCORE_COUNT_MS = 470;
export const FINDING_GAP_MS = 190;
export const BANNER_LINE_MS = 60;
export const SPINNER_TICK_MS = 200;
const SPINNER_TICKS = 13;
export const DIFF_LINE_MS = 260;
export const DIFF_LINES = 4;

const schedule = <T extends Record<string, number>>(
	steps: T
): { at: Record<keyof T, number>; total: number } => {
	const at = {} as Record<keyof T, number>;
	let total = 0;
	for (const [name, duration] of Object.entries(steps)) {
		at[name as keyof T] = total;
		total += duration;
	}
	return { at, total };
};

/** Each act's start time, in the order the recording plays them. */
const TIMELINE = schedule({
	idle: 400,
	type1: COMMAND.length * CHAR_MS,
	run1: 240,
	scan1: SCORE_COUNT_MS + 240,
	project1: 120,
	findings: FINDINGS.length * FINDING_GAP_MS + 600,
	pause1: 500,
	type2: AGENT_COMMAND.length * CHAR_MS,
	banner: MASCOT.length * BANNER_LINE_MS + 620,
	box: 420,
	promptTyping: PROMPT_TEXT.length * PROMPT_CHAR_MS + 520,
	sent: 420,
	spinner: SPINNER_TICKS * SPINNER_TICK_MS,
	diff: DIFF_LINES * DIFF_LINE_MS + 500,
	done: 900,
	pause2: 700,
	type3: COMMAND.length * CHAR_MS,
	run3: 240,
	scan2: SCORE_COUNT_MS + 240,
	project2: 600,
	hold: 1800,
});

export const AT = TIMELINE.at;
export const TOTAL_MS = TIMELINE.total;
/** The frame reduced motion freezes on: every act finished, nothing cleared. */
export const END_MS = AT.hold;

export const typed = (
	t: number,
	start: number,
	text: string,
	charMs = CHAR_MS
): string => text.slice(0, Math.max(0, Math.floor((t - start) / charMs)));

export const countUp = (t: number, start: number, target: number): number =>
	Math.round(
		easeOutCubic(Math.min(1, Math.max(0, (t - start) / SCORE_COUNT_MS))) *
			target
	);

export const cursorOn = (t: number): boolean => t % 1000 < 500;

/** How many of `count` staggered lines are visible `gap` ms apart. */
export const revealed = (
	t: number,
	start: number,
	count: number,
	gap: number
): number => Math.min(count, Math.max(0, Math.floor((t - start) / gap) + 1));
