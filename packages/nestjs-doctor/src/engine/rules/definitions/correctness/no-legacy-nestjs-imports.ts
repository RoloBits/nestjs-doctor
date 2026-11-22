import { SyntaxKind } from "ts-morph";
import type { Rule } from "../../types.js";

/**
 * Imports and decorators that moved package or changed name in a NestJS release.
 *
 * Both sides of these changes compile, so a diff that touches them looks
 * harmless and the failure only shows up during an upgrade, mixed with the
 * errors that do need real code changes. The replacement goes in the message.
 */
const MOVED: Record<string, Record<string, string>> = {
	"@nestjs/common": {
		HttpModule: 'moved to "@nestjs/axios" in Nest 5',
		HttpService: 'moved to "@nestjs/axios" in Nest 5',
	},
	"@nestjs/swagger": {
		ApiUseTags: "renamed to @ApiTags in v4",
		ApiModelProperty: "renamed to @ApiProperty in v4",
		ApiImplicitQuery: "renamed to @ApiQuery in v4",
		ApiImplicitParam: "renamed to @ApiParam in v4",
		ApiImplicitBody: "renamed to @ApiBody in v4",
		ApiImplicitHeader: "renamed to @ApiHeader in v4",
	},
};

/** Renamed decorators, so a file that gets them through a barrel is still caught. */
const RENAMED_DECORATORS = new Map<string, string>([
	["ApiUseTags", "ApiTags"],
	["ApiModelProperty", "ApiProperty"],
	["ApiImplicitQuery", "ApiQuery"],
	["ApiImplicitParam", "ApiParam"],
	["ApiImplicitBody", "ApiBody"],
	["ApiImplicitHeader", "ApiHeader"],
]);

export const noLegacyNestjsImports: Rule = {
	meta: {
		id: "correctness/no-legacy-nestjs-imports",
		category: "correctness",
		severity: "warning",
		description:
			"Imports and decorators that changed package or name across NestJS versions",
		help: "Use the import or decorator named in the message. The old name either fails to compile after the upgrade or silently stops updating the behavior it used to.",
	},

	check(context) {
		const imported = new Set<string>();

		for (const declaration of context.sourceFile.getImportDeclarations()) {
			const from = declaration.getModuleSpecifierValue();
			const moved = MOVED[from];
			if (!moved) {
				continue;
			}

			for (const named of declaration.getNamedImports()) {
				const name = named.getName();
				imported.add(name);

				const change = moved[name];
				if (!change) {
					continue;
				}

				context.report({
					filePath: context.filePath,
					message: `"${name}" was ${change}, but it is still imported from "${from}".`,
					help: `Import "${name}" from its current location, or use the name it was renamed to.`,
					line: named.getStartLineNumber(),
					column: 1,
				});
			}
		}

		// A file can receive a renamed decorator through the project's own barrel,
		// so the usage is checked as well, skipping what the imports already covered.
		for (const decorator of context.sourceFile.getDescendantsOfKind(
			SyntaxKind.Decorator
		)) {
			const name = decorator.getName();
			const replacement = RENAMED_DECORATORS.get(name);
			if (!replacement || imported.has(name)) {
				continue;
			}

			context.report({
				filePath: context.filePath,
				message: `@${name} was renamed to @${replacement} in @nestjs/swagger v4.`,
				help: this.meta.help,
				line: decorator.getStartLineNumber(),
				column: 1,
			});
		}
	},
};
