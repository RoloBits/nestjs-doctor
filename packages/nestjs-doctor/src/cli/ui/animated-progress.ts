import ora from "ora";

const TICK_MS = 33;
const WIPE_MS = 140;
const BAR_WIDTH = 20;
const EASE = 0.4;

interface ProgressFrame {
	displayed: number;
	done: number;
	label: string;
	total: number;
}

/**
 * Moves the displayed fill a step toward the target, so a new count counts up
 * instead of jumping. A shrinking target snaps.
 */
export const easedFill = (displayed: number, target: number): number => {
	if (target <= displayed) {
		return target;
	}
	const next = displayed + (target - displayed) * EASE;
	return target - next < 1 ? target : next;
};

/** Reveals the new label left to right over the old one: `Par│ld label`. */
export const wipeLabel = (
	previous: string,
	next: string,
	progress: number
): string => {
	const revealed = Math.min(
		next.length,
		Math.floor(progress * (next.length + 1))
	);
	return next.slice(0, revealed) + previous.slice(revealed, next.length);
};

export const renderProgressLine = (frame: ProgressFrame): string => {
	if (frame.total <= 0) {
		return frame.label;
	}
	const filled = Math.min(
		BAR_WIDTH,
		Math.round((frame.displayed / frame.total) * BAR_WIDTH)
	);
	const bar = `${"█".repeat(filled)}${"░".repeat(BAR_WIDTH - filled)} ${Math.round(frame.displayed)}/${frame.total}`;
	return `${frame.label} ${bar}`;
};

interface AnimatedProgress {
	fail(text: string): void;
	succeed(text: string): void;
	update(label: string, done?: number, total?: number): void;
}

/** Owns an ora spinner whose bar eases and whose label wipes between phases. */
export const createAnimatedProgress = (text: string): AnimatedProgress => {
	const instance = ora({ text }).start();
	let label = text;
	let previousLabel = text;
	let changedAt = Date.now();
	let done = 0;
	let total = 0;
	let displayed = 0;

	const timer = setInterval(() => {
		displayed = easedFill(displayed, done);
		const progress = (Date.now() - changedAt) / WIPE_MS;
		instance.text = renderProgressLine({
			displayed,
			done,
			label: progress < 1 ? wipeLabel(previousLabel, label, progress) : label,
			total,
		});
	}, TICK_MS);

	const stop = (): void => {
		clearInterval(timer);
	};

	return {
		fail(displayText: string): void {
			stop();
			instance.fail(displayText);
		},
		succeed(displayText: string): void {
			stop();
			instance.succeed(displayText);
		},
		update(nextLabel: string, nextDone = 0, nextTotal = 0): void {
			if (nextLabel !== label) {
				previousLabel = label;
				label = nextLabel;
				changedAt = Date.now();
				displayed = 0;
			}
			done = nextDone;
			total = nextTotal;
		},
	};
};
