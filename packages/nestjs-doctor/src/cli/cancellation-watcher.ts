interface CancellationWatcherDeps {
	/** Fired when the interrupt arrives as SIGINT or as a raw-mode 0x03 byte. */
	onInterrupt: () => void;
	/** Injectable for tests; defaults to the real process. */
	signals?: Pick<NodeJS.Process, "on" | "off">;
	/** Injectable for tests; defaults to process.stdin. */
	stdin?: {
		isTTY?: boolean;
		off(event: string, listener: (data: Buffer | string) => void): unknown;
		on(event: string, listener: (data: Buffer | string) => void): unknown;
	};
}

/** Watches for Ctrl+C as SIGINT and, on a TTY stdin, as a raw-mode 0x03 byte. */
export const watchCancellation = (
	deps: CancellationWatcherDeps
): (() => void) => {
	const signals = deps.signals ?? process;
	const stdin = deps.stdin ?? process.stdin;
	const onInterrupt = (): void => {
		deps.onInterrupt();
	};
	const onByte = (data: Buffer | string): void => {
		if (
			typeof data === "string" ? data.includes("\u0003") : data.includes(0x03)
		) {
			deps.onInterrupt();
		}
	};
	signals.on("SIGINT", onInterrupt);
	if (stdin.isTTY) {
		stdin.on("data", onByte);
	}
	return () => {
		signals.off("SIGINT", onInterrupt);
		stdin.off("data", onByte);
	};
};
