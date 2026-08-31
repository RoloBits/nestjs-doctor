import { type BootWindow, type TimeScale, tOf } from "./boot-timeline.js";
import { cssAttr } from "./escape.js";

const TETHER_DX = 26;
const TETHER_DY = 18;

/** The display position under a client x on a track that spans the window. */
export function posAt(
	clientX: number,
	trackEl: HTMLElement,
	win: BootWindow
): number {
	const r = trackEl.getBoundingClientRect();
	const frac = Math.max(
		0,
		Math.min(1, (clientX - r.left) / Math.max(r.width, 1))
	);
	return win.from + frac * (win.to - win.from);
}

/** The true time under a client x; inverts the piecewise scale. */
export function timeAt(
	clientX: number,
	trackEl: HTMLElement,
	win: BootWindow,
	s?: TimeScale
): number {
	const x = posAt(clientX, trackEl, win);
	return s ? tOf(s, x) : x;
}

// Places the card diagonally off the pointer, on the side with room, and
// draws the tether from the pointer to the card's nearest corner.
export function placeHoverCard(
	card: HTMLElement | null,
	tether: HTMLElement | null,
	bar: HTMLElement,
	pointerX: number,
	pointerY: number
): void {
	if (!(card && tether)) {
		return;
	}
	const w = card.offsetWidth;
	const h = card.offsetHeight;
	const r = bar.getBoundingClientRect();
	let left = pointerX + TETHER_DX;
	let cornerX = left;
	if (left + w > window.innerWidth - 8) {
		left = pointerX - TETHER_DX - w;
		cornerX = left + w;
	}
	let top = r.top - TETHER_DY - h;
	let cornerY = top + h;
	if (top < 8) {
		top = r.bottom + TETHER_DY;
		cornerY = top;
	}
	card.style.left = `${left}px`;
	card.style.top = `${top}px`;
	const dx = cornerX - pointerX;
	const dy = cornerY - pointerY;
	tether.style.left = `${pointerX}px`;
	tether.style.top = `${pointerY}px`;
	tether.style.width = `${Math.hypot(dx, dy)}px`;
	tether.style.transform = `rotate(${(Math.atan2(dy, dx) * 180) / Math.PI}deg)`;
}

interface HoverAnchor {
	bar: HTMLElement;
	y: number;
}

/** The bar the card hangs from: a deduped bar defers to its open original. */
export function hoverAnchor(
	rows: HTMLElement,
	scroll: HTMLElement | null,
	el: HTMLElement,
	row: HTMLElement,
	id: string,
	hookIndex: number | null,
	pointerY: number
): HoverAnchor {
	const own = { bar: el, y: pointerY };
	if (!row.classList.contains("boot-cascade-row")) {
		return own;
	}
	const part =
		hookIndex === null
			? ".boot-bar"
			: `.boot-hook-span[data-hook="${hookIndex}"]`;
	const original = rows.querySelector<HTMLElement>(
		`.boot-group:not(.boot-collapsed) > .boot-class-row:not(.boot-cascade-row)[data-id="${cssAttr(id)}"] ${part}`
	);
	const view = scroll?.getBoundingClientRect();
	if (!(original && view)) {
		return own;
	}
	const r = original.getBoundingClientRect();
	if (r.top < view.top || r.bottom > view.bottom) {
		return own;
	}
	return { bar: original, y: r.top + r.height / 2 };
}
