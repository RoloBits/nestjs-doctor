const TYPING_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT"]);

/** Keys belong to the page while someone is typing into it. */
export const isTypingTarget = (target: EventTarget | null): boolean => {
	const element = target as HTMLElement | null;
	return Boolean(
		element &&
			(TYPING_TAGS.has(element.tagName) || element.isContentEditable === true)
	);
};

/** Elements that handle Enter themselves. */
const INTERACTIVE_SELECTOR =
	'a[href], button, input, select, textarea, [contenteditable]:not([contenteditable="false"])';

export const isInteractiveTarget = (target: Element | null): boolean =>
	target instanceof HTMLElement && target.matches(INTERACTIVE_SELECTOR);

/** True when the frame is visible and focus is on the body or inside it. */
export const isFocusInFrame = (
	active: Element | null,
	frame: HTMLElement | null
): boolean => {
	if (typeof document === "undefined") {
		return false;
	}
	if (!frame) {
		return false;
	}
	const visible =
		typeof frame.checkVisibility === "function"
			? frame.checkVisibility({ visibilityProperty: true })
			: frame.getClientRects().length > 0;
	if (!visible) {
		return false;
	}
	return active === document.body || frame.contains(active);
};
