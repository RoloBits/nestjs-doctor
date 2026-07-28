import { type Project, SyntaxKind } from "ts-morph";

const IMPLEMENTATION_KEYS = ["useClass", "useExisting"];

/**
 * Classes named as the implementation of an object-literal provider, as
 * `{ provide: TOKEN, useClass: Impl }`. Nest instantiates them, so they are in
 * use even though nothing injects them by type.
 */
export function collectProviderImplementations(
	project: Project,
	files: string[]
): Set<string> {
	const implementations = new Set<string>();

	for (const filePath of files) {
		const sourceFile = project.getSourceFile(filePath);
		if (!sourceFile) {
			continue;
		}

		// Any object literal carrying `provide` is a provider definition, wherever
		// it sits — modules commonly group them into consts and spread them in.
		for (const obj of sourceFile.getDescendantsOfKind(
			SyntaxKind.ObjectLiteralExpression
		)) {
			if (!obj.getProperty("provide")) {
				continue;
			}
			for (const key of IMPLEMENTATION_KEYS) {
				const initializer = obj
					.getProperty(key)
					?.asKind(SyntaxKind.PropertyAssignment)
					?.getInitializer();
				if (initializer) {
					implementations.add(initializer.getText());
				}
			}
		}
	}

	return implementations;
}

/** Names appearing in an `extends` clause — a base class is used by its subclasses. */
export function collectExtendedClasses(
	project: Project,
	files: string[]
): Set<string> {
	const extended = new Set<string>();

	for (const filePath of files) {
		const sourceFile = project.getSourceFile(filePath);
		if (!sourceFile) {
			continue;
		}
		for (const cls of sourceFile.getClasses()) {
			const base = cls.getExtends()?.getExpression().getText();
			if (base) {
				extended.add(base.split("<")[0].split(".").pop() ?? base);
			}
		}
	}

	return extended;
}
