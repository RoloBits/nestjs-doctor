// Yields to the event loop between work batches so a spinner can repaint.
// Ten units of work keeps a blocked stretch well under one spinner frame.
export const YIELD_INTERVAL = 10;

export const yieldToEventLoop = (): Promise<void> =>
	new Promise((resolve) => setImmediate(resolve));
