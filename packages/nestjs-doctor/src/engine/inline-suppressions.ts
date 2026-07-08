import { type Diagnostic, isCodeDiagnostic } from "../common/diagnostic.js";

/**
 * Inline suppression comments let developers silence individual rules from
 * within the source, without touching the config file. Directives are written
 * inside a `//` or `/* *​/` comment and use either the `ignore` or `disable`
 * verb (aliases), with an optional scope suffix:
 *
 *   // nestjs-doctor-ignore <rule...>             suppress on the same line
 *   // nestjs-doctor-ignore-line <rule...>        suppress on the same line
 *   // nestjs-doctor-ignore-next-line <rule...>   suppress on the following line
 *   // nestjs-doctor-ignore-file <rule...>        suppress for the whole file
 *
 * `nestjs-doctor-disable*` is accepted everywhere `nestjs-doctor-ignore*` is.
 * The rule list is space- or comma-separated; omitting it suppresses every
 * rule for that scope. An optional `-- reason` trailer is ignored, matching
 * the convention used by other linters.
 */

const DISABLE_TOKEN = "nestjs-doctor-disable";
const IGNORE_TOKEN = "nestjs-doctor-ignore";

// Captures the optional scope suffix (group 1) and the trailing rule list
// (group 2). The negative lookahead rejects unknown suffixes (e.g. a typo like
// `-lines`) so they do not silently fall back to the bare same-line form.
const DIRECTIVE_RE =
	/(?:\/\/|\/\*)\s*nestjs-doctor-(?:ignore|disable)(-next-line|-line|-file)?(?![-\w])([^\n]*)/g;

const RULE_SEPARATOR_RE = /[\s,]+/;

interface SuppressionSet {
	all: boolean;
	rules: Set<string>;
}

interface FileSuppressions {
	byLine: Map<number, SuppressionSet>;
	file: SuppressionSet;
}

const createSuppressionSet = (): SuppressionSet => ({
	all: false,
	rules: new Set<string>(),
});

const matchesRule = (set: SuppressionSet, rule: string): boolean =>
	set.all || set.rules.has(rule);

// A token is a rule only if it contains `/` (every rule id is `category/name`), so a `-- reason` is ignored wherever it sits; no rule tokens means "all".
const parseRuleList = (rest: string): string[] | "all" => {
	let text = rest;

	const closeIdx = text.indexOf("*/");
	if (closeIdx !== -1) {
		text = text.slice(0, closeIdx);
	}

	const tokens = text
		.split(RULE_SEPARATOR_RE)
		.map((token) => token.trim())
		.filter((token) => token.includes("/"));

	return tokens.length === 0 ? "all" : tokens;
};

const applyRuleList = (
	target: SuppressionSet,
	list: string[] | "all"
): void => {
	if (list === "all") {
		target.all = true;
		return;
	}
	for (const rule of list) {
		target.rules.add(rule);
	}
};

const parseFileSuppressions = (text: string): FileSuppressions => {
	const file = createSuppressionSet();
	const byLine = new Map<number, SuppressionSet>();

	// Cheap bail-out: most files contain no directives at all.
	if (!(text.includes(IGNORE_TOKEN) || text.includes(DISABLE_TOKEN))) {
		return { byLine, file };
	}

	const lines = text.split("\n");
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		DIRECTIVE_RE.lastIndex = 0;
		let match: RegExpExecArray | null = DIRECTIVE_RE.exec(line);
		while (match !== null) {
			const suffix = match[1];
			const list = parseRuleList(match[2]);

			if (suffix === "-file") {
				applyRuleList(file, list);
			} else {
				// `-next-line` targets the line below the comment; the bare and
				// `-line` forms target the comment's own line. Diagnostic line
				// numbers are 1-based.
				const lineNumber = suffix === "-next-line" ? i + 2 : i + 1;
				let target = byLine.get(lineNumber);
				if (!target) {
					target = createSuppressionSet();
					byLine.set(lineNumber, target);
				}
				applyRuleList(target, list);
			}

			match = DIRECTIVE_RE.exec(line);
		}
	}

	return { byLine, file };
};

const isSuppressed = (
	diagnostic: Diagnostic,
	suppressions: FileSuppressions
): boolean => {
	if (matchesRule(suppressions.file, diagnostic.rule)) {
		return true;
	}

	if (isCodeDiagnostic(diagnostic)) {
		const lineSet = suppressions.byLine.get(diagnostic.line);
		if (lineSet && matchesRule(lineSet, diagnostic.rule)) {
			return true;
		}
	}

	return false;
};

/**
 * Removes diagnostics silenced by inline `nestjs-doctor-ignore`/`-disable`
 * comments.
 *
 * `getSourceText` resolves a diagnostic's `filePath` to its source. Returning
 * `undefined` (e.g. the file is not in the AST project) leaves the diagnostic
 * untouched. Each file is parsed at most once.
 */
export const filterSuppressedDiagnostics = (
	diagnostics: Diagnostic[],
	getSourceText: (filePath: string) => string | undefined
): Diagnostic[] => {
	if (diagnostics.length === 0) {
		return diagnostics;
	}

	const cache = new Map<string, FileSuppressions | null>();
	const resolve = (filePath: string): FileSuppressions | null => {
		const cached = cache.get(filePath);
		if (cached !== undefined) {
			return cached;
		}
		const text = getSourceText(filePath);
		const parsed = text === undefined ? null : parseFileSuppressions(text);
		cache.set(filePath, parsed);
		return parsed;
	};

	return diagnostics.filter((diagnostic) => {
		const suppressions = resolve(diagnostic.filePath);
		if (!suppressions) {
			return true;
		}
		return !isSuppressed(diagnostic, suppressions);
	});
};
