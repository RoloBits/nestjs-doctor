/** Keeps the below expander at the viewport bottom while the editors grow. */
export function pinExpandBelow(containerEl: Element): void {
	const anchor = containerEl.querySelector(".code-expand-below") || containerEl;
	anchor.scrollIntoView({ block: "end" });
	const ro = new ResizeObserver(() => {
		anchor.scrollIntoView({ block: "end" });
	});
	if (anchor.parentElement) {
		ro.observe(anchor.parentElement);
	}
	setTimeout(() => ro.disconnect(), 1000);
}
