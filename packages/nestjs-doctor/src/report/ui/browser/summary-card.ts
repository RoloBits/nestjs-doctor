import { heading } from "../atoms/heading.js";

interface Row {
	label: string;
	value: string | number;
}

interface CardOptions {
	rows: Row[];
	title: string;
}

// One label/value line inside a stats card.
export function statRow({ label, value }: Row): string {
	return `<div class="ov-stat-row"><span class="ov-stat-label">${label}</span><span class="ov-stat-value">${value}</span></div>`;
}

// One label/value pair inside the project info grid.
export function infoItem({ label, value }: Row): string {
	return `<div class="ov-info-item"><label>${label}</label><span>${value}</span></div>`;
}

// A summary card: a heading over an arbitrary body.
export function card({
	title,
	body,
	fullWidth,
}: {
	body: string;
	fullWidth?: boolean;
	title: string;
}): string {
	return `<div class="ov-card${fullWidth ? " full-width" : ""}">${heading({ level: 3, text: title })}<div class="ov-card-body">${body}</div></div>`;
}

// A summary card whose body is a list of stat rows.
export function statCard({ title, rows }: CardOptions): string {
	return card({ title, body: rows.map(statRow).join("") });
}

// A summary card whose body is the project info grid.
export function infoCard({ title, rows }: CardOptions): string {
	return card({
		title,
		body: `<div class="ov-info-grid">${rows.map(infoItem).join("")}</div>`,
	});
}
