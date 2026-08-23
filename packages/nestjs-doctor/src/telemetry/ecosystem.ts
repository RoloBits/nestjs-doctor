import { WATCHED_PACKAGES } from "../engine/advisories/watched.js";

/**
 * Fixed vocabularies. Only a name listed here can ever be reported, so a
 * private package like `@acme/billing-core` is invisible no matter what a
 * manifest holds.
 */
const FRONTEND: readonly string[] = [
	"@angular/core",
	"astro",
	"next",
	"nuxt",
	"preact",
	"react",
	"solid-js",
	"svelte",
	"vue",
];

const DATABASES: readonly string[] = [
	"@elastic/elasticsearch",
	"better-sqlite3",
	"cassandra-driver",
	"ioredis",
	"mongodb",
	"mssql",
	"mysql",
	"mysql2",
	"oracledb",
	"pg",
	"redis",
	"sqlite3",
];

/** Unscoped vendors only; the scoped families below cover the rest. */
const CLOUD: readonly string[] = [
	"@supabase/supabase-js",
	"aws-sdk",
	"firebase-admin",
];

/** Scope prefixes, so a whole vendor family counts without listing every package. */
const CLOUD_SCOPES: [string, string][] = [
	["@aws-sdk/", "aws"],
	["@azure/", "azure"],
	["@google-cloud/", "gcp"],
];

const MESSAGING: readonly string[] = ["amqplib", "bullmq", "kafkajs", "nats"];

export interface EcosystemFacts {
	cloud: string[];
	databases: string[];
	frontend: string[];
	messaging: string[];
	nestjsPackages: string[];
}

const EMPTY: EcosystemFacts = {
	cloud: [],
	databases: [],
	frontend: [],
	messaging: [],
	nestjsPackages: [],
};

let detected: EcosystemFacts = EMPTY;

/** Recorded during project detection, which already holds the manifest. */
export const setEcosystem = (facts: EcosystemFacts): void => {
	detected = facts;
};

export const getEcosystem = (): EcosystemFacts => detected;

const matched = (deps: Record<string, string>, list: readonly string[]) =>
	list.filter((name) => deps[name]).sort();

/**
 * Which known ecosystem packages a project depends on. Returns names from the
 * lists above and nothing else — never the project's own dependency list.
 */
export function detectEcosystem(
	deps: Record<string, string> = {}
): EcosystemFacts {
	const cloud = new Set(matched(deps, CLOUD));
	for (const name of Object.keys(deps)) {
		const scope = CLOUD_SCOPES.find(([prefix]) => name.startsWith(prefix));
		if (scope) {
			cloud.add(scope[1]);
		}
	}

	return {
		cloud: [...cloud].sort(),
		databases: matched(deps, DATABASES),
		frontend: matched(deps, FRONTEND),
		messaging: matched(deps, MESSAGING),
		nestjsPackages: matched(deps, WATCHED_PACKAGES),
	};
}
