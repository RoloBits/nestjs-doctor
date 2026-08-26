import { describe, expect, it, vi } from "vitest";
import { watchCancellation } from "../../src/cli/cancellation-watcher.js";

type SignalHub = ReturnType<typeof signalHub>;
type StdinHub = ReturnType<typeof stdinHub>;

const signalHub = () => {
	const listeners = new Map<string, Array<() => void>>();
	return {
		count: (event: string) => listeners.get(event)?.length ?? 0,
		emit: (event: string) => {
			for (const listener of [...(listeners.get(event) ?? [])]) {
				listener();
			}
		},
		off: (event: string, listener: () => void) => {
			listeners.set(
				event,
				(listeners.get(event) ?? []).filter((kept) => kept !== listener)
			);
		},
		on: (event: string, listener: () => void) => {
			listeners.set(event, [...(listeners.get(event) ?? []), listener]);
		},
	};
};

const stdinHub = (isTTY = true) => {
	const listeners = new Map<string, Array<(data: Buffer | string) => void>>();
	return {
		isTTY,
		count: (event: string) => listeners.get(event)?.length ?? 0,
		emit: (data: Buffer | string) => {
			for (const listener of [...(listeners.get("data") ?? [])]) {
				listener(data);
			}
		},
		off: (event: string, listener: (data: Buffer | string) => void) => {
			listeners.set(
				event,
				(listeners.get(event) ?? []).filter((kept) => kept !== listener)
			);
		},
		on: (event: string, listener: (data: Buffer | string) => void) => {
			listeners.set(event, [...(listeners.get(event) ?? []), listener]);
		},
	};
};

const startWatching = (
	onInterrupt = vi.fn(),
	signals: SignalHub = signalHub(),
	stdin: StdinHub = stdinHub()
) => ({
	onInterrupt,
	signals,
	dispose: watchCancellation({ onInterrupt, signals, stdin }),
	stdin,
});

describe("cancellation watcher", () => {
	it("fires the interrupt callback when SIGINT arrives", () => {
		const watch = startWatching();

		watch.signals.emit("SIGINT");

		expect(watch.onInterrupt).toHaveBeenCalledTimes(1);
	});

	it("registers exactly one SIGINT handler", () => {
		const watch = startWatching();

		expect(watch.signals.count("SIGINT")).toBe(1);
	});

	it("keeps firing until disposed", () => {
		const watch = startWatching();

		watch.signals.emit("SIGINT");
		watch.signals.emit("SIGINT");

		expect(watch.onInterrupt).toHaveBeenCalledTimes(2);
	});

	it("fires on a raw-mode 0x03 byte", () => {
		const watch = startWatching();

		watch.stdin.emit(Buffer.from([0x03]));

		expect(watch.onInterrupt).toHaveBeenCalledTimes(1);
	});

	it("fires when a chunk contains 0x03 among other bytes", () => {
		const watch = startWatching();

		watch.stdin.emit(Buffer.from([0x41, 0x03, 0x42]));

		expect(watch.onInterrupt).toHaveBeenCalledTimes(1);
	});

	it("ignores bytes that are not ETX", () => {
		const watch = startWatching();

		watch.stdin.emit(Buffer.from("abc"));
		watch.stdin.emit("hello");

		expect(watch.onInterrupt).not.toHaveBeenCalled();
	});

	it("fires on a string containing the ETX character", () => {
		const watch = startWatching();

		watch.stdin.emit("x\u0003");

		expect(watch.onInterrupt).toHaveBeenCalledTimes(1);
	});

	it("does not watch stdin when it is not a TTY", () => {
		const watch = startWatching(vi.fn(), signalHub(), stdinHub(false));

		expect(watch.stdin.count("data")).toBe(0);

		watch.stdin.emit(Buffer.from([0x03]));

		expect(watch.onInterrupt).not.toHaveBeenCalled();
	});

	it("still registers the SIGINT handler without a TTY", () => {
		const watch = startWatching(vi.fn(), signalHub(), stdinHub(false));

		expect(watch.signals.count("SIGINT")).toBe(1);

		watch.signals.emit("SIGINT");

		expect(watch.onInterrupt).toHaveBeenCalledTimes(1);
	});

	it("decides whether to watch bytes at registration time", () => {
		const stdin = stdinHub(true);
		const watch = startWatching(vi.fn(), signalHub(), stdin);

		stdin.isTTY = false;

		expect(stdin.count("data")).toBe(1);

		stdin.emit(Buffer.from([0x03]));

		expect(watch.onInterrupt).toHaveBeenCalledTimes(1);
	});

	it("the disposer removes the SIGINT handler", () => {
		const watch = startWatching();

		watch.dispose();
		watch.signals.emit("SIGINT");

		expect(watch.onInterrupt).not.toHaveBeenCalled();
		expect(watch.signals.count("SIGINT")).toBe(0);
	});

	it("the disposer removes the byte watcher", () => {
		const watch = startWatching();

		watch.dispose();
		watch.stdin.emit(Buffer.from([0x03]));

		expect(watch.onInterrupt).not.toHaveBeenCalled();
		expect(watch.stdin.count("data")).toBe(0);
	});
});
