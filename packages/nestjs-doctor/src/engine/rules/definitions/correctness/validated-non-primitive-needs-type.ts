import type { PropertyDeclaration, Type } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import type { Rule } from "../../types.js";

const CLASS_VALIDATOR_DECORATORS = new Set([
	"ValidateNested",
	"IsString",
	"IsNumber",
	"IsBoolean",
	"IsEmail",
	"IsArray",
	"IsEnum",
	"IsNotEmpty",
	"IsDefined",
	"IsOptional",
	"IsDate",
	"IsObject",
	"IsInt",
	"IsPositive",
	"IsNegative",
	"IsUUID",
	"IsUrl",
	"IsISO8601",
	"Matches",
	"Min",
	"Max",
	"MinLength",
	"MaxLength",
	"ArrayMinSize",
	"ArrayMaxSize",
	"ArrayNotEmpty",
	"IsIn",
	"IsNotIn",
	"Length",
	"Contains",
	"IsAlpha",
	"IsAlphanumeric",
	"IsDecimal",
	"IsHexColor",
	"IsJSON",
	"IsPhoneNumber",
	"IsIP",
	"IsCreditCard",
	"IsDateString",
	"IsMilitaryTime",
	"IsMongoId",
	"IsPort",
	"IsSemVer",
	"IsStrongPassword",
]);

const PRIMITIVE_TYPES = new Set([
	"string",
	"number",
	"boolean",
	"Date",
	"any",
	"unknown",
	"bigint",
	"symbol",
	"undefined",
	"null",
	"void",
	"never",
]);

const WHITESPACE_REGEX = /\s/g;
const ARRAY_SUFFIX_REGEX = /\[\]$/;
const ARRAY_GENERIC_REGEX = /^Array<(.+)>$/;
const STRING_LITERAL_REGEX = /^["']/;
const NUMBER_LITERAL_REGEX = /^\d+$/;

function isPrimitiveType(typeText: string): boolean {
	const cleaned = typeText.replace(WHITESPACE_REGEX, "");

	// Handle union types (e.g. "string | null", "AddressDto | undefined")
	if (cleaned.includes("|")) {
		return cleaned.split("|").every((part) => isPrimitiveType(part));
	}

	// Direct primitive
	if (PRIMITIVE_TYPES.has(cleaned)) {
		return true;
	}

	// Primitive arrays like string[], number[][] (recursive for nested arrays)
	if (ARRAY_SUFFIX_REGEX.test(cleaned)) {
		const arrayBase = cleaned.replace(ARRAY_SUFFIX_REGEX, "");
		if (isPrimitiveType(arrayBase)) {
			return true;
		}
	}

	// Array<primitive> (recursive for nested generics like Array<Array<string>>)
	const arrayGenericMatch = cleaned.match(ARRAY_GENERIC_REGEX);
	if (arrayGenericMatch && isPrimitiveType(arrayGenericMatch[1])) {
		return true;
	}

	// Enum-like (string literal unions, number literal types)
	if (
		STRING_LITERAL_REGEX.test(cleaned) ||
		NUMBER_LITERAL_REGEX.test(cleaned)
	) {
		return true;
	}

	return false;
}

/** True when the type, unwrapping arrays and unions, names a class. */
function isClassType(type: Type | undefined): boolean {
	if (!type) {
		return false;
	}
	if (type.isArray()) {
		return isClassType(type.getArrayElementType());
	}
	if (type.isUnion()) {
		return type.getUnionTypes().some(isClassType);
	}
	return Boolean(
		type
			.getSymbol()
			?.getDeclarations()
			.some((declaration) => declaration.isKind(SyntaxKind.ClassDeclaration))
	);
}

function resolvesToClass(prop: PropertyDeclaration): boolean {
	return isClassType(prop.getType());
}

export const validatedNonPrimitiveNeedsType: Rule = {
	meta: {
		id: "correctness/validated-non-primitive-needs-type",
		category: "correctness",
		severity: "warning",
		description:
			"DTO properties with class-validator decorators on non-primitive types must have @Type() from class-transformer",
		help: "Add @Type(() => ClassName) from 'class-transformer' to ensure proper transformation.",
	},

	check(context) {
		for (const cls of context.sourceFile.getClasses()) {
			for (const prop of cls.getProperties()) {
				const decorators = prop.getDecorators();
				if (decorators.length === 0) {
					continue;
				}

				const hasValidatorDecorator = decorators.some((d) =>
					CLASS_VALIDATOR_DECORATORS.has(d.getName())
				);
				if (!hasValidatorDecorator) {
					continue;
				}

				const hasTypeDecorator = decorators.some((d) => d.getName() === "Type");
				if (hasTypeDecorator) {
					continue;
				}

				// Enums don't need @Type() — class-transformer handles them natively
				const hasIsEnumDecorator = decorators.some(
					(d) => d.getName() === "IsEnum"
				);
				if (hasIsEnumDecorator) {
					continue;
				}

				// Check the property type
				const typeNode = prop.getTypeNode();
				if (!typeNode) {
					// No explicit type annotation — skip (could be inferred as primitive)
					continue;
				}

				const typeText = typeNode.getText();
				if (isPrimitiveType(typeText)) {
					continue;
				}

				// @Type() constructs a class. A union or alias has nothing to build.
				if (!resolvesToClass(prop)) {
					continue;
				}

				context.report({
					filePath: context.filePath,
					message: `Property '${prop.getName()}' has type '${typeText}' with class-validator decorators but is missing @Type() decorator.`,
					help: this.meta.help,
					line: prop.getStartLineNumber(),
					column: 1,
				});
			}
		}
	},
};
