import { createHash } from "node:crypto";
import { relative } from "node:path";
import type { Diagnostic } from "../common/diagnostic.js";
import { isCodeDiagnostic } from "../common/diagnostic.js";

const BACKSLASH_RE = /\\/g;
const WHITESPACE_RE = /\s+/g;

/** Separator that cannot occur in a rule id, path, or message. */
const IDENTITY_SEPARATOR = "\u0000";

/** Path of `filePath` relative to `targetPath`, always with forward slashes. */
export function toRelativePath(targetPath: string, filePath: string): string {
	const rel = relative(targetPath, filePath);
	const normalized = (rel || filePath).replace(BACKSLASH_RE, "/");
	return normalized.startsWith("../")
		? filePath.replace(BACKSLASH_RE, "/")
		: normalized;
}

/** The source text of the line a diagnostic points at, if it was captured. */
function sourceLineText(diagnostic: Diagnostic): string {
	if (!isCodeDiagnostic(diagnostic)) {
		return "";
	}
	const match = diagnostic.sourceLines?.find(
		(entry) => entry.line === diagnostic.line
	);
	return match ? match.text.trim().replace(WHITESPACE_RE, " ") : "";
}

/**
 * Stable identity for a diagnostic: rule, path, message, and the anchor line's
 * text. Excludes line and column, which shift under unrelated edits.
 */
export function diagnosticIdentity(
	diagnostic: Diagnostic,
	targetPath: string
): string {
	const parts = [
		diagnostic.rule,
		toRelativePath(targetPath, diagnostic.filePath),
		diagnostic.message,
		sourceLineText(diagnostic),
	];

	if (!isCodeDiagnostic(diagnostic)) {
		parts.push(diagnostic.entity, diagnostic.schemaColumn ?? "");
	}

	return parts.join(IDENTITY_SEPARATOR);
}

/** Hex digest of {@link diagnosticIdentity} — the form reporters emit. */
export function fingerprint(
	diagnostic: Diagnostic,
	targetPath: string
): string {
	return createHash("sha256")
		.update(diagnosticIdentity(diagnostic, targetPath))
		.digest("hex");
}

/** Counts identities, so repeated findings subtract one at a time. */
export function countIdentities(
	diagnostics: Diagnostic[],
	targetPath: string
): Map<string, number> {
	const counts = new Map<string, number>();
	for (const diagnostic of diagnostics) {
		const key = diagnosticIdentity(diagnostic, targetPath);
		counts.set(key, (counts.get(key) ?? 0) + 1);
	}
	return counts;
}

export interface DiagnosticDelta {
	/** Findings present at the base that are gone at HEAD. */
	fixed: number;
	/** Findings at HEAD with no counterpart at the base. */
	introduced: Diagnostic[];
}

/**
 * Subtracts the base revision's findings from HEAD's. Each side's identities
 * are computed against its own root.
 */
export function diffDiagnostics(
	head: Diagnostic[],
	base: Diagnostic[],
	targetPath: string,
	baseTargetPath: string
): DiagnosticDelta {
	const remaining = countIdentities(base, baseTargetPath);
	const introduced: Diagnostic[] = [];

	for (const diagnostic of head) {
		const key = diagnosticIdentity(diagnostic, targetPath);
		const available = remaining.get(key) ?? 0;
		if (available > 0) {
			remaining.set(key, available - 1);
			continue;
		}
		introduced.push(diagnostic);
	}

	let fixed = 0;
	for (const count of remaining.values()) {
		fixed += count;
	}

	return { introduced, fixed };
}
