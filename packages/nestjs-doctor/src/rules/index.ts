import { noBarrelExportInternals } from "./architecture/no-barrel-export-internals.js";
import { noBusinessLogicInControllers } from "./architecture/no-business-logic-in-controllers.js";
import { noCircularModuleDeps } from "./architecture/no-circular-module-deps.js";
import { noGodModule } from "./architecture/no-god-module.js";
import { noGodService } from "./architecture/no-god-service.js";
import { noManualInstantiation } from "./architecture/no-manual-instantiation.js";
import { noOrmInControllers } from "./architecture/no-orm-in-controllers.js";
import { noOrmInServices } from "./architecture/no-orm-in-services.js";
import { noRepositoryInControllers } from "./architecture/no-repository-in-controllers.js";
import { preferConstructorInjection } from "./architecture/prefer-constructor-injection.js";
import { preferInterfaceInjection } from "./architecture/prefer-interface-injection.js";
import { requireFeatureModules } from "./architecture/require-feature-modules.js";
import { requireModuleBoundaries } from "./architecture/require-module-boundaries.js";
import { noAsyncWithoutAwait } from "./correctness/no-async-without-await.js";
import { noDuplicateModuleMetadata } from "./correctness/no-duplicate-module-metadata.js";
import { noDuplicateRoutes } from "./correctness/no-duplicate-routes.js";
import { noEmptyHandlers } from "./correctness/no-empty-handlers.js";
import { noMissingFilterCatch } from "./correctness/no-missing-filter-catch.js";
import { noMissingGuardMethod } from "./correctness/no-missing-guard-method.js";
import { noMissingInjectable } from "./correctness/no-missing-injectable.js";
import { noMissingInterceptorMethod } from "./correctness/no-missing-interceptor-method.js";
import { noMissingModuleDecorator } from "./correctness/no-missing-module-decorator.js";
import { noMissingPipeMethod } from "./correctness/no-missing-pipe-method.js";
import { preferAwaitInHandlers } from "./correctness/prefer-await-in-handlers.js";
import { preferReadonlyInjection } from "./correctness/prefer-readonly-injection.js";
import { requireInjectDecorator } from "./correctness/require-inject-decorator.js";
import { requireLifecycleInterface } from "./correctness/require-lifecycle-interface.js";
import { noBlockingConstructor } from "./performance/no-blocking-constructor.js";
import { noDynamicRequire } from "./performance/no-dynamic-require.js";
import { noLoggingInLoops } from "./performance/no-logging-in-loops.js";
import { noOrphanModules } from "./performance/no-orphan-modules.js";
import { noQueryInLoop } from "./performance/no-query-in-loop.js";
import { noSyncIo } from "./performance/no-sync-io.js";
import { noUnnecessaryAsync } from "./performance/no-unnecessary-async.js";
import { noUnusedModuleExports } from "./performance/no-unused-module-exports.js";
import { noUnusedProviders } from "./performance/no-unused-providers.js";
import { preferPagination } from "./performance/prefer-pagination.js";
import { noCsrfDisabled } from "./security/no-csrf-disabled.js";
import { noDangerousRedirects } from "./security/no-dangerous-redirects.js";
import { noEval } from "./security/no-eval.js";
import { noExposedEnvVars } from "./security/no-exposed-env-vars.js";
import { noExposedStackTrace } from "./security/no-exposed-stack-trace.js";
import { noHardcodedSecrets } from "./security/no-hardcoded-secrets.js";
import { noWeakCrypto } from "./security/no-weak-crypto.js";
import { requireAuthGuard } from "./security/require-auth-guard.js";
import { requireValidationPipe } from "./security/require-validation-pipe.js";
import type { AnyRule } from "./types.js";

export const allRules: AnyRule[] = [
	// Architecture — file-scoped
	noBusinessLogicInControllers,
	noRepositoryInControllers,
	noOrmInControllers,
	noOrmInServices,
	noManualInstantiation,
	preferConstructorInjection,
	preferInterfaceInjection,
	requireModuleBoundaries,
	noBarrelExportInternals,

	// Architecture — project-scoped
	noCircularModuleDeps,
	noGodModule,
	noGodService,
	requireFeatureModules,

	// Correctness — file-scoped
	preferReadonlyInjection,
	requireLifecycleInterface,
	noEmptyHandlers,
	noDuplicateRoutes,
	noMissingGuardMethod,
	noMissingPipeMethod,
	noMissingFilterCatch,
	noMissingInterceptorMethod,
	noAsyncWithoutAwait,
	preferAwaitInHandlers,
	noDuplicateModuleMetadata,
	noMissingModuleDecorator,
	requireInjectDecorator,

	// Correctness — project-scoped
	noMissingInjectable,

	// Security
	noHardcodedSecrets,
	requireAuthGuard,
	noEval,
	noWeakCrypto,
	noExposedEnvVars,
	requireValidationPipe,
	noCsrfDisabled,
	noExposedStackTrace,
	noDangerousRedirects,

	// Performance — file-scoped
	noSyncIo,
	noQueryInLoop,
	noLoggingInLoops,
	noUnnecessaryAsync,
	noBlockingConstructor,
	preferPagination,
	noDynamicRequire,

	// Performance — project-scoped
	noUnusedProviders,
	noUnusedModuleExports,
	noOrphanModules,
];

export function getRules(): AnyRule[] {
	return [...allRules];
}
