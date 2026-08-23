import posthog from "posthog-js";

/** No-ops when PostHog never initialised, which is the opted-out case. */
export function track(event: string, properties?: Record<string, unknown>) {
	try {
		if (posthog.__loaded) {
			posthog.capture(event, properties);
		}
	} catch {
		// Analytics never breaks the page.
	}
}
