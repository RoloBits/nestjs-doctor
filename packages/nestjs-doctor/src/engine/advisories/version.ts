interface Parsed {
	parts: number[];
	pre: string[];
}

const NUMERIC = /^\d+$/;
const LEADING_V = /^v/;
const EXACT = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const CARET = /^\^\s*(\d+)\.(\d+)\.(\d+)(?:-[0-9A-Za-z.-]+)?$/;
const TILDE = /^~\s*(\d+)\.(\d+)\.(\d+)(?:-[0-9A-Za-z.-]+)?$/;
const GTE_LT =
	/^>=\s*(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)\s+<\s*(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)$/;

function parse(version: string): Parsed | null {
	const cleaned = version.trim().replace(LEADING_V, "");
	const [core, ...rest] = cleaned.split("+")[0].split("-");
	const parts = core.split(".").map(Number);
	if (parts.length !== 3 || parts.some((n) => !Number.isInteger(n) || n < 0)) {
		return null;
	}
	return { parts, pre: rest.join("-") ? rest.join("-").split(".") : [] };
}

/** -1, 0 or 1, with a prerelease sorting below its own release. */
export function compareVersions(a: string, b: string): number | null {
	const left = parse(a);
	const right = parse(b);
	if (!(left && right)) {
		return null;
	}

	for (let i = 0; i < 3; i++) {
		if (left.parts[i] !== right.parts[i]) {
			return left.parts[i] < right.parts[i] ? -1 : 1;
		}
	}

	if (left.pre.length === 0 && right.pre.length === 0) {
		return 0;
	}
	// 1.0.0-next.1 precedes 1.0.0, so an absent prerelease wins.
	if (left.pre.length === 0) {
		return 1;
	}
	if (right.pre.length === 0) {
		return -1;
	}

	for (let i = 0; i < Math.max(left.pre.length, right.pre.length); i++) {
		const l = left.pre[i];
		const r = right.pre[i];
		if (l === undefined) {
			return -1;
		}
		if (r === undefined) {
			return 1;
		}
		if (l === r) {
			continue;
		}
		if (NUMERIC.test(l) && NUMERIC.test(r)) {
			return Number(l) < Number(r) ? -1 : 1;
		}
		return l < r ? -1 : 1;
	}
	return 0;
}

const lt = (a: string, b: string) => compareVersions(a, b) === -1;
const lte = (a: string, b: string) => {
	const c = compareVersions(a, b);
	return c === -1 || c === 0;
};

interface Range {
	/** Version the range stops below, exclusive. Absent when unbounded. */
	below?: string;
	/** Lowest version the range admits, inclusive. */
	from: string;
}

/** The versions a spec admits. Null for a form this does not parse. */
export function parseRange(spec: string): Range | null {
	const text = spec.trim();

	if (EXACT.test(text)) {
		return { from: text, below: undefined };
	}

	const caret = text.match(CARET);
	if (caret) {
		const [, major, minor, patch] = caret.map(Number) as unknown as number[];
		const from = `${major}.${minor}.${patch}`;
		if (major > 0) {
			return { from, below: `${major + 1}.0.0` };
		}
		if (minor > 0) {
			return { from, below: `0.${minor + 1}.0` };
		}
		return { from, below: `0.0.${patch + 1}` };
	}

	const tilde = text.match(TILDE);
	if (tilde) {
		const [, major, minor, patch] = tilde.map(Number) as unknown as number[];
		return {
			from: `${major}.${minor}.${patch}`,
			below: `${major}.${minor + 1}.0`,
		};
	}

	const bounded = text.match(GTE_LT);
	if (bounded) {
		return lt(bounded[1], bounded[2])
			? { from: bounded[1], below: bounded[2] }
			: null;
	}

	return null;
}

/** True when no version the range admits reaches `patched`. */
export function rangeIsWhollyBelow(spec: string, patched: string): boolean {
	const range = parseRange(spec);
	if (!range) {
		return false;
	}
	if (range.below === undefined) {
		return lt(range.from, patched);
	}
	return lte(range.below, patched);
}

/**
 * True when the range admits a version reaching `floor`. Compared on the
 * release triple: a range carrying no prerelease never matches one.
 */
export function rangeReaches(spec: string, floor: string): boolean {
	const range = parseRange(spec);
	if (!range) {
		return false;
	}
	if (range.below === undefined) {
		return !lt(range.from, floor);
	}
	return lt(floor.split("-")[0], range.below);
}
