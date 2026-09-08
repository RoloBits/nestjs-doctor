/** Records that a named stage finished. */
export type PhaseMark = (phase: string) => void;

const NO_MARKS: PhaseMark = () => {
	// Discards the mark.
};

/**
 * Writes one line per stage to stderr when NESTJS_DOCTOR_PHASE_TIMINGS holds a
 * non-empty value, and does nothing otherwise.
 */
export function startPhaseTimer(label: string): PhaseMark {
	if (!process.env.NESTJS_DOCTOR_PHASE_TIMINGS) {
		return NO_MARKS;
	}
	const started = performance.now();
	let previous = started;
	return (phase: string) => {
		const now = performance.now();
		process.stderr.write(
			`[timing] ${label} ${phase} ${Math.round(now - previous)}ms (${Math.round(now - started)}ms)\n`
		);
		previous = now;
	};
}
