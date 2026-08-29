// What the boot trace shows when the report carries no timings.
export function BootEmpty() {
	return (
		<div className="boot-empty">
			No boot timings in this report. Capture them with the nestjs-boot-trace
			skill: instrument main.ts with <code>snapshot: true</code>, boot once, and
			scan with <code>--timings nestjs-doctor-timings.json</code>.
		</div>
	);
}
