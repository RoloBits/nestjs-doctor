/**
 * Packages the advisory table tracks. `pnpm advisories:check` walks this list
 * against the GitHub Advisory Database and reports what `data.ts` is missing.
 */

/** Every package published under the `@nestjs` scope. */
const OFFICIAL_PACKAGES: readonly string[] = [
	"@nestjs/apollo",
	"@nestjs/axios",
	"@nestjs/azure-database",
	"@nestjs/azure-func-http",
	"@nestjs/azure-serverless",
	"@nestjs/azure-storage",
	"@nestjs/bull",
	"@nestjs/bull-shared",
	"@nestjs/bullmq",
	"@nestjs/cache-manager",
	"@nestjs/class-transformer",
	"@nestjs/class-validator",
	"@nestjs/cli",
	"@nestjs/common",
	"@nestjs/config",
	"@nestjs/core",
	"@nestjs/cqrs",
	"@nestjs/devtools-integration",
	"@nestjs/elasticsearch",
	"@nestjs/event-emitter",
	"@nestjs/graphql",
	"@nestjs/jwt",
	"@nestjs/mapped-types",
	"@nestjs/mau",
	"@nestjs/mercurius",
	"@nestjs/microservices",
	"@nestjs/mongoose",
	"@nestjs/ng-universal",
	"@nestjs/passport",
	"@nestjs/platform-express",
	"@nestjs/platform-fastify",
	"@nestjs/platform-socket.io",
	"@nestjs/platform-ws",
	"@nestjs/schedule",
	"@nestjs/schematics",
	"@nestjs/sequelize",
	"@nestjs/serve-static",
	"@nestjs/serverless-core",
	"@nestjs/swagger",
	"@nestjs/terminus",
	"@nestjs/testing",
	"@nestjs/throttler",
	"@nestjs/typeorm",
	"@nestjs/websockets",
];

/**
 * Third-party packages a Nest project installs deliberately, ordered by weekly
 * downloads at the time of writing.
 */
const ECOSYSTEM_PACKAGES: readonly string[] = [
	"@opentelemetry/instrumentation-nestjs-core",
	"nestjs-pino",
	"@sentry/nestjs",
	"nestjs-zod",
	"@golevelup/nestjs-discovery",
	"nestjs-cls",
	"@willsoto/nestjs-prometheus",
	"nestjs-i18n",
	"@bull-board/nestjs",
	"@nestjs-modules/mailer",
	"@mikro-orm/nestjs",
	"@golevelup/nestjs-rabbitmq",
	"nestjs-otel",
	"nestjs-ddtrace",
	"@automapper/nestjs",
	"nest-keycloak-connect",
];

export const WATCHED_PACKAGES: readonly string[] = [
	...OFFICIAL_PACKAGES,
	...ECOSYSTEM_PACKAGES,
];
