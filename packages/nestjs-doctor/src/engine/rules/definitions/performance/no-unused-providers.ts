import type { ClassDeclaration } from "ts-morph";
import {
	collectExtendedClasses,
	collectProviderImplementations,
} from "../../../graph/custom-providers.js";
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
		const name = clause.getExpression().getText().split("<")[0];
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
		description:
			"Injectable providers that are never injected and have no self-activating decorators may be dead code",
		help: "Remove the unused provider, inject it where needed, or verify it is activated by a framework decorator (e.g. @Cron, @OnEvent).",
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
		const CONSUMER_DECORATORS = ["Controller", "Resolver", "WebSocketGateway"];
		for (const filePath of context.files) {
			const sourceFile = context.project.getSourceFile(filePath);
			if (!sourceFile) {
				continue;
			}

			for (const cls of sourceFile.getClasses()) {
				const isConsumer = CONSUMER_DECORATORS.some(
					(d) => cls.getDecorator(d) !== undefined
				);
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

		// Nest instantiates a useClass/useExisting target, and a base class runs
		// through every subclass, without either being injected by type.
		const implementations = collectProviderImplementations(
			context.project,
			context.files
		);
		const extended = collectExtendedClasses(context.project, context.files);

		for (const provider of context.providers.values()) {
			const name = provider.name;

			if (implementations.has(name) || extended.has(name)) {
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

			// Skip self-activating providers (e.g. @Cron, @OnEvent, @Process)
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
