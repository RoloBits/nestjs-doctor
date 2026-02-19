import { SyntaxKind } from "ts-morph";
import type { Rule } from "../types.js";

const SECRET_PATTERNS = [
	{ pattern: /^(?=.*\d)[A-Za-z0-9+/]{40,}={0,2}$/, name: "Base64 key" },
	{ pattern: /^sk[-_][a-zA-Z0-9]{20,}$/, name: "Secret key" },
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
		pattern: /^[a-f0-9]{64}$/,
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
				if (pattern.test(value)) {
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
		}

		// Check variable declarations and property assignments with suspicious names
		const variableDeclarations = context.sourceFile.getDescendantsOfKind(
			SyntaxKind.VariableDeclaration
		);

		for (const decl of variableDeclarations) {
			const name = decl.getName();
			const initializer = decl.getInitializer();
			if (!initializer || initializer.getKind() !== SyntaxKind.StringLiteral) {
				continue;
			}

			if (!hasSuspiciousName(name)) {
				continue;
			}

			const value = initializer.getText().slice(1, -1);
			if (isSuspiciousValue(value)) {
				context.report({
					filePath: context.filePath,
					message: `Variable '${name}' appears to contain a hardcoded secret.`,
					help: this.meta.help,
					line: decl.getStartLineNumber(),
					column: 1,
				});
			}
		}

		const propertyAssignments = context.sourceFile.getDescendantsOfKind(
			SyntaxKind.PropertyAssignment
		);

		for (const prop of propertyAssignments) {
			const name = prop.getName();
			const initializer = prop.getInitializer();
			if (!initializer || initializer.getKind() !== SyntaxKind.StringLiteral) {
				continue;
			}

			if (!hasSuspiciousName(name)) {
				continue;
			}

			const value = initializer.getText().slice(1, -1);
			if (isSuspiciousValue(value)) {
				context.report({
					filePath: context.filePath,
					message: `Property '${name}' appears to contain a hardcoded secret.`,
					help: this.meta.help,
					line: prop.getStartLineNumber(),
					column: 1,
				});
			}
		}
	},
};
