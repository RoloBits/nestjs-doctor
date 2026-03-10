import { noBarrelExportInternals } from "./definitions/architecture/no-barrel-export-internals.js";
import { noBusinessLogicInControllers } from "./definitions/architecture/no-business-logic-in-controllers.js";
import { noCircularModuleDeps } from "./definitions/architecture/no-circular-module-deps.js";
import { noManualInstantiation } from "./definitions/architecture/no-manual-instantiation.js";
import { noOrmInControllers } from "./definitions/architecture/no-orm-in-controllers.js";
import { noOrmInServices } from "./definitions/architecture/no-orm-in-services.js";
import { noRepositoryInControllers } from "./definitions/architecture/no-repository-in-controllers.js";
import { noServiceLocator } from "./definitions/architecture/no-service-locator.js";
import { preferConstructorInjection } from "./definitions/architecture/prefer-constructor-injection.js";
import { requireModuleBoundaries } from "./definitions/architecture/require-module-boundaries.js";
import { noAsyncWithoutAwait } from "./definitions/correctness/no-async-without-await.js";
import { noDuplicateModuleMetadata } from "./definitions/correctness/no-duplicate-module-metadata.js";
import { noDuplicateRoutes } from "./definitions/correctness/no-duplicate-routes.js";
import { noEmptyHandlers } from "./definitions/correctness/no-empty-handlers.js";
import { noFireAndForgetAsync } from "./definitions/correctness/no-fire-and-forget-async.js";
import { noMissingFilterCatch } from "./definitions/correctness/no-missing-filter-catch.js";
import { noMissingGuardMethod } from "./definitions/correctness/no-missing-guard-method.js";
import { noMissingInjectable } from "./definitions/correctness/no-missing-injectable.js";
import { noMissingInterceptorMethod } from "./definitions/correctness/no-missing-interceptor-method.js";
import { noMissingModuleDecorator } from "./definitions/correctness/no-missing-module-decorator.js";
import { noMissingPipeMethod } from "./definitions/correctness/no-missing-pipe-method.js";
import { preferReadonlyInjection } from "./definitions/correctness/prefer-readonly-injection.js";
import { requireInjectDecorator } from "./definitions/correctness/require-inject-decorator.js";
import { requireLifecycleInterface } from "./definitions/correctness/require-lifecycle-interface.js";
import { noBlockingConstructor } from "./definitions/performance/no-blocking-constructor.js";
import { noDynamicRequire } from "./definitions/performance/no-dynamic-require.js";
import { noOrphanModules } from "./definitions/performance/no-orphan-modules.js";
import { noRequestScopeAbuse } from "./definitions/performance/no-request-scope-abuse.js";
import { noSyncIo } from "./definitions/performance/no-sync-io.js";
import { noUnusedModuleExports } from "./definitions/performance/no-unused-module-exports.js";
import { noUnusedProviders } from "./definitions/performance/no-unused-providers.js";
import { requireCascadeRule } from "./definitions/schema/require-cascade-rule.js";
import { requirePrimaryKey } from "./definitions/schema/require-primary-key.js";
import { requireTimestamps } from "./definitions/schema/require-timestamps.js";
import { noCsrfDisabled } from "./definitions/security/no-csrf-disabled.js";
import { noDangerousRedirects } from "./definitions/security/no-dangerous-redirects.js";
import { noEval } from "./definitions/security/no-eval.js";
import { noExposedEnvVars } from "./definitions/security/no-exposed-env-vars.js";
import { noExposedStackTrace } from "./definitions/security/no-exposed-stack-trace.js";
import { noHardcodedSecrets } from "./definitions/security/no-hardcoded-secrets.js";
import { noRawEntityInResponse } from "./definitions/security/no-raw-entity-in-response.js";
import { noSynchronizeInProduction } from "./definitions/security/no-synchronize-in-production.js";
import { noWeakCrypto } from "./definitions/security/no-weak-crypto.js";
import type { AnyRule } from "./types.js";

export const allRules: AnyRule[] = [
	// Architecture — file-scoped
	noBusinessLogicInControllers,
	noRepositoryInControllers,
	noOrmInControllers,
	noOrmInServices,
	noManualInstantiation,
	noServiceLocator,
	preferConstructorInjection,
	requireModuleBoundaries,
	noBarrelExportInternals,

	// Architecture — project-scoped
	noCircularModuleDeps,

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
	noDuplicateModuleMetadata,
	noMissingModuleDecorator,
	requireInjectDecorator,
	noFireAndForgetAsync,

	// Correctness — project-scoped
	noMissingInjectable,

	// Security
	noHardcodedSecrets,
	noEval,
	noWeakCrypto,
	noExposedEnvVars,
	noCsrfDisabled,
	noExposedStackTrace,
	noDangerousRedirects,
	noSynchronizeInProduction,
	noRawEntityInResponse,

	// Performance — file-scoped
	noSyncIo,
	noBlockingConstructor,
	noDynamicRequire,
	noRequestScopeAbuse,

	// Performance — project-scoped
	noUnusedProviders,
	noUnusedModuleExports,
	noOrphanModules,

	// Schema
	requirePrimaryKey,
	requireTimestamps,
	requireCascadeRule,
];

export function getRules(): AnyRule[] {
	return [...allRules];
}
