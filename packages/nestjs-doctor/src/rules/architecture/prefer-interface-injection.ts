import { isService } from "../../engine/decorator-utils.js";
import type { Rule } from "../types.js";

export const preferInterfaceInjection: Rule = {
	meta: {
		id: "architecture/prefer-interface-injection",
		category: "architecture",
		severity: "info",
		description:
			"Consider injecting abstract classes instead of concrete implementations for testability",
		help: "Create an abstract class and use a custom provider token for better testability.",
	},

	check(context) {
		for (const cls of context.sourceFile.getClasses()) {
			if (!isService(cls)) {
				continue;
			}

			const ctor = cls.getConstructors()[0];
			if (!ctor) {
				continue;
			}

			for (const param of ctor.getParameters()) {
				const typeNode = param.getTypeNode();
				if (!typeNode) {
					continue;
				}

				const typeText = typeNode.getText();

				// Skip common framework types
				if (
					typeText === "ConfigService" ||
					typeText === "Logger" ||
					typeText === "EventEmitter2" ||
					typeText === "HttpService" ||
					typeText === "JwtService" ||
					typeText === "ModuleRef" ||
					typeText.startsWith("Cache")
				) {
					continue;
				}

				// Flag concrete service injections (ends with Service, Repository, etc.)
				if (
					typeText.endsWith("Service") &&
					!typeText.startsWith("Abstract") &&
					!typeText.startsWith("I")
				) {
					// Only flag if the service has many deps (suggesting it's complex enough to abstract)
					// This is a soft suggestion, so we keep it minimal
					// We only flag if both names end with Service (cross-service injection)
					const className = cls.getName() ?? "";
					if (className.endsWith("Service") && typeText !== className) {
						context.report({
							filePath: context.filePath,
							message: `Service '${className}' injects concrete '${typeText}'. Consider using an abstract class for testability.`,
							help: this.meta.help,
							line: param.getStartLineNumber(),
							column: 1,
						});
					}
				}
			}
		}
	},
};
