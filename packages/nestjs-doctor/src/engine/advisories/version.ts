/** A version split for comparison. `pre` is empty for a release. */
interface Parsed {
	parts: number[];
	pre: string[];
}

const NUMERIC = /^\d+$/;
const LEADING_V = /^v/;
const SEMVER = /\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?/;

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
		const bothNumeric = NUMERIC.test(l) && NUMERIC.test(r);
		if (bothNumeric) {
			return Number(l) < Number(r) ? -1 : 1;
		}
		return l < r ? -1 : 1;
	}
	return 0;
}

/**
 * The version a range like `^11.1.2` or `>=10.4.0 <11` would install today, as
 * far as a lockfile-free read can tell: the lowest version it allows. A range
 * with no concrete floor returns null and the caller reports nothing.
 */
export function lowestAllowed(range: string): string | null {
	const match = range.match(SEMVER);
	return match ? match[0] : null;
}
