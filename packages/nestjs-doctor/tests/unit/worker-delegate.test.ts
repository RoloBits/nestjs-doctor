import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	type CanDelegateInput,
	canDelegateToWorker,
	runInWorker,
	type ScanOutcome,
	type ScanWorkerRequest,
	setWorkerUrl,
	type WorkerLike,
} from "../../src/cli/worker-delegate.js";

const workerUrl = new URL("file:///fake/scan-worker.mjs");

class FakeWorker {
	readonly handlers = new Map<string, Array<(...args: never[]) => void>>();
	terminateCalls = 0;

	on(event: string, listener: (...args: never[]) => void): void {
		this.handlers.set(event, [...(this.handlers.get(event) ?? []), listener]);
	}

	emit(event: string, ...args: never[]): void {
		for (const listener of [...(this.handlers.get(event) ?? [])]) {
			listener(...args);
		}
	}

	terminate(): Promise<number> {
		this.terminateCalls += 1;
		return Promise.resolve(1);
	}

	asWorkerLike(): WorkerLike {
		return this as unknown as WorkerLike;
	}
}

const requestFixture = (): ScanWorkerRequest =>
	({
		kind: "single",
		options: {
			base: undefined,
			blocking: "error",
			changedFilesFrom: undefined,
			configPath: undefined,
			minScore: undefined,
			scope: "full",
			staged: false,
			telemetry: true,
		},
		targetPath: "/repo/app",
		version: "0.0.0",
	}) as unknown as ScanWorkerRequest;

const outcomeFixture = (): ScanOutcome =>
	({
		kind: "single",
		customRuleWarnings: [],
		firstTelemetrySend: true,
	}) as unknown as ScanOutcome;

/** Fails to compile if the outcome stops carrying the notice decision. */
const firstSendOf = (outcome: ScanOutcome): boolean =>
	outcome.firstTelemetrySend;

const delegateInput = (
	overrides: Partial<CanDelegateInput> = {}
): CanDelegateInput => ({
	hasOutputStep: true,
	interactive: true,
	isMachineReadable: false,
	statFile: vi.fn(async () => ({}) as Awaited<ReturnType<typeof stat>>),
	...overrides,
});

describe("worker delegate — canDelegateToWorker", () => {
	beforeEach(() => {
		setWorkerUrl(null);
	});

	it("cannot delegate without a worker url, even when interactive", async () => {
		const input = delegateInput();

		await expect(canDelegateToWorker(input)).resolves.toBe(false);
		expect(input.statFile).not.toHaveBeenCalled();
	});

	it("cannot delegate when not interactive", async () => {
		setWorkerUrl(workerUrl);
		const input = delegateInput({ interactive: false });

		await expect(canDelegateToWorker(input)).resolves.toBe(false);
		expect(input.statFile).not.toHaveBeenCalled();
	});

	it("cannot delegate when machine readable", async () => {
		setWorkerUrl(workerUrl);
		const input = delegateInput({ isMachineReadable: true });

		await expect(canDelegateToWorker(input)).resolves.toBe(false);
		expect(input.statFile).not.toHaveBeenCalled();
	});

	it("cannot delegate without an output step", async () => {
		setWorkerUrl(workerUrl);
		const input = delegateInput({ hasOutputStep: false });

		await expect(canDelegateToWorker(input)).resolves.toBe(false);
		expect(input.statFile).not.toHaveBeenCalled();
	});

	it("a stat failure means no delegation", async () => {
		setWorkerUrl(workerUrl);
		const input = delegateInput({
			statFile: vi.fn(() => Promise.reject(new Error("ENOENT"))),
		});

		await expect(canDelegateToWorker(input)).resolves.toBe(false);
	});

	it("an existing worker entry delegates", async () => {
		setWorkerUrl(workerUrl);

		await expect(canDelegateToWorker(delegateInput())).resolves.toBe(true);
	});
});

describe("worker delegate — runInWorker", () => {
	beforeEach(() => {
		setWorkerUrl(null);
	});

	it("rejects when the worker was never configured", async () => {
		const createWorker = vi.fn();

		await expect(
			runInWorker(requestFixture(), vi.fn(), {
				createWorker,
				emitProgress: vi.fn(),
			})
		).rejects.toThrow("scan worker is not available");
		expect(createWorker).not.toHaveBeenCalled();
	});

	it("posts the request and resolves on the outcome message", async () => {
		setWorkerUrl(workerUrl);
		const worker = new FakeWorker();
		const createWorker = vi.fn(() => worker.asWorkerLike());
		const apply = vi.fn();
		const promise = runInWorker(requestFixture(), apply, {
			createWorker,
			emitProgress: vi.fn(),
		});

		const outcome = outcomeFixture();
		worker.emit("message", { kind: "outcome", outcome } as never);
		worker.emit("exit", 0 as never);

		await expect(promise).resolves.toBeUndefined();
		expect(createWorker).toHaveBeenCalledWith(workerUrl, requestFixture());
		expect(apply).toHaveBeenCalledWith(outcome);
		// The reporter runs in the worker; the notice is printed on main.
		expect(firstSendOf(apply.mock.calls[0]?.[0] as ScanOutcome)).toBe(true);
		expect(worker.terminateCalls).toBe(1);
	});

	it("forwards progress messages through emitProgress", async () => {
		setWorkerUrl(workerUrl);
		const worker = new FakeWorker();
		const emitProgress = vi.fn();
		const promise = runInWorker(requestFixture(), vi.fn(), {
			createWorker: () => worker.asWorkerLike(),
			emitProgress,
		});

		worker.emit("message", {
			kind: "progress",
			label: "Parsing files",
			done: 3,
			total: 9,
		} as never);
		worker.emit("message", {
			kind: "progress",
			label: "Analyzing the project",
		} as never);
		worker.emit("message", {
			kind: "outcome",
			outcome: outcomeFixture(),
		} as never);

		await expect(promise).resolves.toBeUndefined();
		expect(emitProgress).toHaveBeenNthCalledWith(1, "Parsing files", 3, 9);
		expect(emitProgress).toHaveBeenNthCalledWith(
			2,
			"Analyzing the project",
			undefined,
			undefined
		);
	});

	it("rejects on an error message", async () => {
		setWorkerUrl(workerUrl);
		const worker = new FakeWorker();
		const promise = runInWorker(requestFixture(), vi.fn(), {
			createWorker: () => worker.asWorkerLike(),
			emitProgress: vi.fn(),
		});

		worker.emit("message", { kind: "error", message: "boom" } as never);

		await expect(promise).rejects.toThrow("boom");
		expect(worker.terminateCalls).toBe(1);
	});

	it("rejects on a nonzero exit", async () => {
		setWorkerUrl(workerUrl);
		const worker = new FakeWorker();
		const promise = runInWorker(requestFixture(), vi.fn(), {
			createWorker: () => worker.asWorkerLike(),
			emitProgress: vi.fn(),
		});

		worker.emit("exit", 1 as never);

		await expect(promise).rejects.toThrow("scan worker exited with code 1");
		expect(worker.terminateCalls).toBe(1);
	});

	it("maps a throw from apply to a rejection and still terminates", async () => {
		setWorkerUrl(workerUrl);
		const worker = new FakeWorker();
		const promise = runInWorker(
			requestFixture(),
			vi.fn(() => {
				throw new Error("apply blew up");
			}),
			{ createWorker: () => worker.asWorkerLike(), emitProgress: vi.fn() }
		);

		worker.emit("message", {
			kind: "outcome",
			outcome: outcomeFixture(),
		} as never);

		await expect(promise).rejects.toThrow("apply blew up");
		expect(worker.terminateCalls).toBe(1);
	});

	it("a late error after the outcome leaves the promise resolved", async () => {
		setWorkerUrl(workerUrl);
		const worker = new FakeWorker();
		const apply = vi.fn();
		const promise = runInWorker(requestFixture(), apply, {
			createWorker: () => worker.asWorkerLike(),
			emitProgress: vi.fn(),
		});

		worker.emit("message", {
			kind: "outcome",
			outcome: outcomeFixture(),
		} as never);
		worker.emit("message", { kind: "error", message: "late boom" } as never);

		await expect(promise).resolves.toBeUndefined();
		expect(apply).toHaveBeenCalledTimes(1);
		expect(worker.terminateCalls).toBe(1);
	});
});
