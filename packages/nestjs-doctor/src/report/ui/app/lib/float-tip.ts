const ROOT_IDS = ["mg-dock", "header-meta", "detail-badges"];

let installed = false;
let shown: Element | null = null;

function tipElement(): HTMLElement {
	let tip = document.getElementById("mg-float-tip");
	if (!tip) {
		tip = document.createElement("div");
		tip.className = "schema-tooltip";
		tip.id = "mg-float-tip";
		document.body.appendChild(tip);
	}
	return tip;
}

function hide(tip: HTMLElement): void {
	shown = null;
	tip.style.display = "none";
}

function show(tip: HTMLElement, el: Element): void {
	shown = el;
	tip.textContent = el.getAttribute("data-tip");
	// Resets the offset before measuring the width.
	tip.style.left = "0px";
	tip.style.top = "0px";
	tip.style.display = "block";
	const r = el.getBoundingClientRect();
	const tr = tip.getBoundingClientRect();
	const x = Math.max(8, Math.min(r.left, window.innerWidth - tr.width - 8));
	let y = r.top - tr.height - 6;
	if (y < 8) {
		y = r.bottom + 6;
	}
	tip.style.left = `${x}px`;
	tip.style.top = `${y}px`;
}

function onMouseOver(ev: Event): void {
	const target = ev.target;
	if (!(target instanceof Element)) {
		return;
	}
	const tip = tipElement();
	const el = target.closest("[data-tip]");
	if (!(el && ROOT_IDS.some((id) => el.closest(`#${id}`)))) {
		if (shown) {
			hide(tip);
		}
		return;
	}
	if (el === shown) {
		return;
	}
	show(tip, el);
}

// Floating tooltip for data-tip elements inside clipping containers, one
// delegated listener for the page, installed on first mount.
export function installFloatTip(): void {
	if (installed) {
		return;
	}
	installed = true;
	tipElement();
	document.addEventListener("mouseover", onMouseOver);
	document.addEventListener("mouseleave", () => hide(tipElement()));
}
