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
import { preferReadonlyInjection } from "./correctness/prefer-readonly-injection.js";
import { noHardcodedSecrets } from "./security/no-hardcoded-secrets.js";
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

	// Correctness
	preferReadonlyInjection,

	// Security
	noHardcodedSecrets,
];

export function getRules(): AnyRule[] {
	return [...allRules];
}
