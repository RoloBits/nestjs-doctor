// Yields to the event loop between work batches so a spinner can repaint.
export const YIELD_INTERVAL = 25;

export const yieldToEventLoop = (): Promise<void> =>
	new Promise((resolve) => setImmediate(resolve));
