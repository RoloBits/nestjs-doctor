import type { RuleGroup } from "../findings.js";

/** One finding flattened out of its rule group, addressable by index. */
interface FlatFinding {
	groupIndex: number;
	position: number;
}

type ListRow =
	| { kind: "category"; label: string }
	| { groupIndex: number; kind: "group" };

/**
 * One caption per category, wherever the category first appears. The first
 * not-scored group opens its own block and categories caption again inside it.
 */
export const buildListRows = (groups: RuleGroup[]): ListRow[] => {
	const rows: ListRow[] = [];
	let seen = new Set<string>();
	let inScored = true;
	for (const [groupIndex, group] of groups.entries()) {
		if (inScored && !group.scored) {
			inScored = false;
			seen = new Set<string>();
			rows.push({ kind: "category", label: "not scored" });
		}
		const category = group.rule.split("/")[0];
		if (!(group.rule.startsWith("custom/") || seen.has(category))) {
			seen.add(category);
			rows.push({ kind: "category", label: category });
		}
		rows.push({ groupIndex, kind: "group" });
	}
	return rows;
};

export const flattenFindings = (groups: RuleGroup[]): FlatFinding[] => {
	const flat: FlatFinding[] = [];
	for (const [groupIndex, group] of groups.entries()) {
		for (const position of group.diagnostics.keys()) {
			flat.push({ groupIndex, position });
		}
	}
	return flat;
};

const firstOfNextGroup = (flat: FlatFinding[], from: number): number => {
	const current = flat[from];
	if (!current) {
		return from;
	}
	let index = from;
	while (
		index < flat.length - 1 &&
		flat[index].groupIndex === current.groupIndex
	) {
		index += 1;
	}
	return index;
};

const lastOfPreviousGroup = (flat: FlatFinding[], from: number): number => {
	const current = flat[from];
	if (!current) {
		return from;
	}
	let index = from;
	while (index > 0 && flat[index].groupIndex === current.groupIndex) {
		index -= 1;
	}
	return index;
};

/**
 * Movement over the flattened list. `delta` of ±1 steps one finding; anything
 * else jumps a whole rule group in that direction.
 */
export const moveSelection = (
	flat: FlatFinding[],
	from: number,
	delta: 1 | -1 | "group-next" | "group-prev"
): number => {
	if (flat.length === 0) {
		return 0;
	}
	if (delta === "group-next") {
		return Math.min(firstOfNextGroup(flat, from), flat.length - 1);
	}
	if (delta === "group-prev") {
		return lastOfPreviousGroup(flat, from);
	}
	const next = from + delta;
	if (next < 0 || next >= flat.length) {
		return from;
	}
	return next;
};

/** Keeps a scroll offset inside [0, total - visible]. */
export const clampOffset = (
	offset: number,
	total: number,
	visible: number
): number => Math.max(0, Math.min(offset, Math.max(0, total - visible)));

/** Rows a list may use: terminal height minus everything else on screen, with a floor. */
export const listCapacity = (
	rows: number,
	chromeRows: number,
	minimum: number
): number => Math.max(minimum, rows - chromeRows);

/** Keeps the selection inside the visible window. */
export const scrollWindow = (
	offset: number,
	selected: number,
	height: number
): number => {
	if (height <= 0) {
		return 0;
	}
	if (selected < offset) {
		return selected;
	}
	if (selected >= offset + height) {
		return selected - height + 1;
	}
	return offset;
};
