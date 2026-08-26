import type { ClassDeclaration } from "ts-morph";
import {
	collectCustomProviderClasses,
	collectExtendedClasses,
	isTestFile,
} from "../../../graph/custom-providers.js";
import { isController } from "../../../nest-class-inspector.js";
import { INFRA_SUFFIXES } from "../../constants.js";
import type { ProjectRule } from "../../types.js";

const SELF_ACTIVATING_DECORATORS = new Set([
	// @nestjs/schedule
	"Cron",
	"Interval",
	"Timeout",
	// @nestjs/event-emitter
	"OnEvent",
	// @nestjs/bull / @nestjs/bullmq
	"Process",
	"OnQueueEvent",
	// TypeORM subscriber (class decorator)
	"EventSubscriber",
	// @nestjs/websockets
	"SubscribeMessage",
	// @nestjs/websockets gateway (class decorator)
	"WebSocketGateway",
]);

// Contracts the framework calls without anyone injecting the class: lifecycle
// hooks, and the guard/interceptor/filter/pipe/middleware roles.
const SELF_ACTIVATING_INTERFACES = new Set([
	"BeforeApplicationShutdown",
	"CanActivate",
	"ExceptionFilter",
	"NestInterceptor",
	"NestMiddleware",
	"OnApplicationBootstrap",
	"OnApplicationShutdown",
	"OnModuleDestroy",
	"OnModuleInit",
	"PipeTransform",
]);

function implementsSelfActivating(cls: ClassDeclaration): boolean {
	return cls.getImplements().some((clause) => {
		const text = clause.getExpression().getText();
		const name = text.split(".").pop()?.split("<")[0] ?? text;
		return SELF_ACTIVATING_INTERFACES.has(name);
	});
}

function hasSelfActivatingDecorator(cls: ClassDeclaration): boolean {
	// Check class-level decorators
	for (const decorator of cls.getDecorators()) {
		if (SELF_ACTIVATING_DECORATORS.has(decorator.getName())) {
			return true;
		}
	}

	// Check method-level decorators
	for (const method of cls.getMethods()) {
		for (const decorator of method.getDecorators()) {
			if (SELF_ACTIVATING_DECORATORS.has(decorator.getName())) {
				return true;
			}
		}
	}

	return false;
}

export const noUnusedProviders: ProjectRule = {
	meta: {
		id: "performance/no-unused-providers",
		category: "performance",
		severity: "warning",
		tags: ["module-graph"],
		description:
			"Injectable providers that are never injected and that the framework does not activate may be dead code",
		help: "Remove the unused provider, inject it where needed, or verify the framework activates it, through a decorator such as @Cron or @OnEvent or a contract such as OnModuleInit or CanActivate.",
		scope: "project",
	},

	check(context) {
		// Collect all dependency names from all providers
		const allDependencies = new Set<string>();
		for (const provider of context.providers.values()) {
			for (const dep of provider.dependencies) {
				allDependencies.add(dep);
			}
		}

		// Resolvers and gateways inject services via constructor just like controllers,
		// so their dependencies must be counted to avoid false "unused provider" warnings.
		// A class registered in a module's `controllers` array is a consumer even when
		// its decorator is a project-specific wrapper around @Controller().
		const registeredControllers = new Set<string>();
		for (const mod of context.moduleGraph.modules.values()) {
			for (const controller of mod.controllers) {
				registeredControllers.add(controller);
			}
		}
		for (const filePath of context.files) {
			const sourceFile = context.project.getSourceFile(filePath);
			if (!sourceFile) {
				continue;
			}

			for (const cls of sourceFile.getClasses()) {
				const className = cls.getName();
				const isConsumer =
					(className !== undefined && registeredControllers.has(className)) ||
					isController(cls) ||
					cls.getDecorator("Resolver") !== undefined ||
					cls.getDecorator("WebSocketGateway") !== undefined;
				if (!isConsumer) {
					continue;
				}
				const ctor = cls.getConstructors()[0];
				if (!ctor) {
					continue;
				}
				for (const param of ctor.getParameters()) {
					const typeNode = param.getTypeNode();
					const typeText = typeNode
						? typeNode.getText()
						: param.getType().getText();
					const simpleName =
						typeText.split(".").pop()?.split("<")[0] ?? typeText;
					allDependencies.add(simpleName);
				}
			}
		}

		// Custom-provider targets and base classes are in use without being injected.
		// Test files are left out so a spec cannot exempt a production provider.
		const productionFiles = context.files.filter(
			(filePath) => !isTestFile(filePath)
		);
		const customProviderClasses = collectCustomProviderClasses(
			context.project,
			productionFiles
		);
		const extended = collectExtendedClasses(context.project, productionFiles);

		for (const provider of context.providers.values()) {
			const name = provider.name;

			if (
				customProviderClasses.implementationNames.has(name) ||
				customProviderClasses.constructedClasses.has(
					provider.classDeclaration
				) ||
				extended.has(name)
			) {
				continue;
			}

			// Skip common infrastructure patterns
			if (INFRA_SUFFIXES.some((suffix) => name.endsWith(suffix))) {
				continue;
			}

			// Skip if it's used as a dependency somewhere
			if (allDependencies.has(name)) {
				continue;
			}

			// Skip providers the framework activates, by decorator or by contract.
			if (
				hasSelfActivatingDecorator(provider.classDeclaration) ||
				implementsSelfActivating(provider.classDeclaration)
			) {
				continue;
			}

			// Skip if it's in module exports (it may be used externally)
			let isExported = false;
			for (const mod of context.moduleGraph.modules.values()) {
				if (mod.exports.includes(name)) {
					isExported = true;
					break;
				}
			}
			if (isExported) {
				continue;
			}

			context.report({
				filePath: provider.filePath,
				message: `Provider '${name}' is never injected by any other provider or controller.`,
				help: this.meta.help,
				line: provider.classDeclaration.getStartLineNumber(),
				column: 1,
			});
		}
	},
};
