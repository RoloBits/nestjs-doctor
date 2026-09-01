import { Node, SyntaxKind } from "ts-morph";
import type { Rule } from "../../types.js";

// A digest/hash is far more often a fixture or migration id than a real key.
const HEX_SECRET_PATTERN = /^[a-f0-9]{64}$/;

const SECRET_PATTERNS = [
	{ pattern: /^sk[-_][a-zA-Z0-9]{20,}$/, name: "Secret key" },
	// Issued keys carry an environment segment the plain form misses:
	// sk_live_…, pk_test_…, sk-proj-…, sk-ant-api03-….
	{
		pattern:
			/^(?:sk|pk|rk)[-_](?:[a-z0-9]{2,6}[-_]){1,2}(?=[A-Za-z0-9]*\d)[A-Za-z0-9]{16,}$/,
		name: "API secret key",
	},
	{ pattern: /^pk[-_][a-zA-Z0-9]{20,}$/, name: "Public key (in source)" },
	{
		pattern: /^ghp_[a-zA-Z0-9]{36,}$/,
		name: "GitHub personal access token",
	},
	{
		pattern: /^github_pat_[a-zA-Z0-9_]{22,}$/,
		name: "GitHub fine-grained PAT",
	},
	{ pattern: /^gho_[a-zA-Z0-9]{36,}$/, name: "GitHub OAuth token" },
	{ pattern: /^xox[bpras]-[a-zA-Z0-9-]+$/, name: "Slack token" },
	{
		pattern: /^eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\./,
		name: "JWT token",
	},
	{ pattern: /^AKIA[0-9A-Z]{16}$/, name: "AWS Access Key ID" },
	{
		pattern: HEX_SECRET_PATTERN,
		name: "Hex-encoded secret (64 chars)",
	},
];

const VARIABLE_NAME_PATTERNS = [
	/secret/i,
	/password/i,
	/passwd/i,
	/api[_-]?key/i,
	/auth[_-]?token/i,
	/private[_-]?key/i,
	/access[_-]?key/i,
	/client[_-]?secret/i,
];

const PLACEHOLDER_VALUES = new Set([
	"your-secret-here",
	"changeme",
	"password",
]);

const DOT_SEPARATED_CONSTANT =
	/^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)+$/;

function isSuspiciousValue(value: string): boolean {
	if (value.length < 8) {
		return false;
	}
	if (value.includes("${")) {
		return false;
	}
	if (value.startsWith("process.env")) {
		return false;
	}
	if (PLACEHOLDER_VALUES.has(value)) {
		return false;
	}
	if (value.includes(" ")) {
		return false;
	}
	if (DOT_SEPARATED_CONSTANT.test(value)) {
		return false;
	}
	return true;
}

function hasSuspiciousName(name: string): boolean {
	return VARIABLE_NAME_PATTERNS.some((p) => p.test(name));
}

// The shape of a permission scope. Digits are excluded so `admin:secretpass123`
// stays a credential.
const SCOPE_VALUE = /^[a-z]+(:[a-z]+)+$/;

const WORD_SEGMENT = /^[a-z]{3,}$/;
const SEGMENT_SPLIT = /[-_:/.]|(?<=[a-z])(?=[A-Z])/;

// True when every part is a plain word, the shape of a message key.
function isWordSequence(value: string): boolean {
	const parts = value.split(SEGMENT_SPLIT);
	return (
		parts.length >= 2 &&
		parts.every((part) => WORD_SEGMENT.test(part.toLowerCase()))
	);
}

const IDENTIFIER_SHAPE = /^[A-Za-z][A-Za-z0-9]*(?:[-_:./][A-Za-z0-9]+)+$/;
const SINGLE_CAPITALIZED_WORD = /^[A-Z][a-z]+$/;
const REGEX_METACHARACTER = /[\\^$*+?()[\]{}|]/;
const HAS_DIGIT = /\d/;
const VERSION_SEGMENT = /^v\d{1,3}$/i;

// True for a config/identifier key or a regex pattern, not a secret value.
// A digit-bearing segment still counts as a secret unless it is a version tag.
function isIdentifierShapedValue(value: string): boolean {
	if (REGEX_METACHARACTER.test(value) || SINGLE_CAPITALIZED_WORD.test(value)) {
		return true;
	}
	if (!IDENTIFIER_SHAPE.test(value)) {
		return false;
	}
	return value
		.split(SEGMENT_SPLIT)
		.every((part) => !HAS_DIGIT.test(part) || VERSION_SEGMENT.test(part));
}

const NON_ALNUM = /[^a-z0-9]/g;

// True when the value only restates the name, as a config key does.
/**
 * True for `password: "password:update"`, where the first segment names the same
 * thing as the binding. A colon value that does not is a credential, not a scope.
 */
function isPermissionScope(name: string, value: string): boolean {
	if (!SCOPE_VALUE.test(value)) {
		return false;
	}
	const flatName = name.toLowerCase().replace(NON_ALNUM, "");
	const flatResource = value.split(":")[0].toLowerCase().replace(NON_ALNUM, "");
	return flatName.startsWith(flatResource) || flatResource.startsWith(flatName);
}

function echoesName(name: string, value: string): boolean {
	return (
		name.toLowerCase().replace(NON_ALNUM, "") ===
		value.toLowerCase().replace(NON_ALNUM, "")
	);
}

// A string handed to `throw` is a message or a field name.
function isThrownMessage(node: Node): boolean {
	return node.getFirstAncestorByKind(SyntaxKind.ThrowStatement) !== undefined;
}

// The name of the variable/property a string literal is directly assigned to, if any.
function getBindingName(literal: Node): string | undefined {
	const parent = literal.getParent();
	if (
		Node.isVariableDeclaration(parent) ||
		Node.isPropertyAssignment(parent) ||
		Node.isPropertyDeclaration(parent)
	) {
		return parent.getName();
	}
	return undefined;
}

export const noHardcodedSecrets: Rule = {
	meta: {
		id: "security/no-hardcoded-secrets",
		category: "security",
		severity: "error",
		description:
			"Detect hardcoded secrets, API keys, and tokens in source code",
		help: "Move secrets to environment variables and access them via ConfigService.",
	},

	check(context) {
		// Check all string literals in the file
		const stringLiterals = context.sourceFile.getDescendantsOfKind(
			SyntaxKind.StringLiteral
		);

		for (const literal of stringLiterals) {
			const value = literal.getLiteralValue();

			// Skip short strings and imports
			if (value.length < 16) {
				continue;
			}
			if (literal.getParent()?.getKind() === SyntaxKind.ImportDeclaration) {
				continue;
			}

			for (const { pattern, name } of SECRET_PATTERNS) {
				if (!pattern.test(value)) {
					continue;
				}
				if (pattern === HEX_SECRET_PATTERN) {
					const bindingName = getBindingName(literal);
					if (!(bindingName && hasSuspiciousName(bindingName))) {
						continue;
					}
				}
				context.report({
					filePath: context.filePath,
					message: `Possible hardcoded ${name} detected.`,
					help: this.meta.help,
					line: literal.getStartLineNumber(),
					column: 1,
				});
				break;
			}
		}

		// A named binding holding a string literal, wherever it is declared.
		const NAMED_BINDINGS = [
			{ kind: SyntaxKind.VariableDeclaration, noun: "Variable" },
			{ kind: SyntaxKind.PropertyAssignment, noun: "Property" },
			{ kind: SyntaxKind.PropertyDeclaration, noun: "Property" },
		] as const;

		for (const { kind, noun } of NAMED_BINDINGS) {
			for (const node of context.sourceFile.getDescendantsOfKind(kind)) {
				const name = node.getName();
				const initializer = node.getInitializer();
				if (
					!initializer ||
					initializer.getKind() !== SyntaxKind.StringLiteral
				) {
					continue;
				}

				if (!hasSuspiciousName(name)) {
					continue;
				}

				const value = initializer.getText().slice(1, -1);
				if (
					isPermissionScope(name, value) ||
					echoesName(name, value) ||
					isIdentifierShapedValue(value) ||
					(isThrownMessage(node) && isWordSequence(value))
				) {
					continue;
				}
				if (isSuspiciousValue(value)) {
					context.report({
						filePath: context.filePath,
						message: `${noun} '${name}' appears to contain a hardcoded secret.`,
						help: this.meta.help,
						line: node.getStartLineNumber(),
						column: 1,
					});
				}
			}
		}
	},
};
