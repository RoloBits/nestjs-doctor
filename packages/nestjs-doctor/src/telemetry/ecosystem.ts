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
	"@neondatabase/serverless",
	"@planetscale/database",
	"@supabase/supabase-js",
	"aws-sdk",
	"firebase-admin",
	"miniflare",
	"wrangler",
];

/**
 * npm scopes are owned, so nothing but the vendor can publish under these. That
 * makes the part after the slash safe to report as a sub-service without
 * listing every one — `@aws-sdk/client-s3` becomes `aws:client-s3`.
 */
const CLOUD_SCOPES: [string, string][] = [
	["@aws-sdk/", "aws"],
	["@azure/", "azure"],
	["@cloudflare/", "cloudflare"],
	["@google-cloud/", "gcp"],
	["@netlify/", "netlify"],
	["@upstash/", "upstash"],
	["@vercel/", "vercel"],
];

/** An npm name segment, so a workspace package aliased into a vendor scope
 * cannot smuggle anything odd into the payload. */
const SAFE_SEGMENT = /^[a-z0-9][a-z0-9._-]{0,39}$/;

/** Enough for any real project, and a ceiling on payload size. */
const MAX_SERVICES = 40;

const MESSAGING: readonly string[] = ["amqplib", "bullmq", "kafkajs", "nats"];

export interface EcosystemFacts {
	cloud: string[];
	cloudServices: string[];
	databases: string[];
	frontend: string[];
	messaging: string[];
	nestjsPackages: string[];
}

const EMPTY: EcosystemFacts = {
	cloud: [],
	cloudServices: [],
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
	const services = new Set<string>();

	for (const name of Object.keys(deps)) {
		const scope = CLOUD_SCOPES.find(([prefix]) => name.startsWith(prefix));
		if (!scope) {
			continue;
		}
		const [prefix, vendor] = scope;
		cloud.add(vendor);
		const service = name.slice(prefix.length);
		if (SAFE_SEGMENT.test(service) && services.size < MAX_SERVICES) {
			services.add(`${vendor}:${service}`);
		}
	}

	return {
		cloud: [...cloud].sort(),
		cloudServices: [...services].sort(),
		databases: matched(deps, DATABASES),
		frontend: matched(deps, FRONTEND),
		messaging: matched(deps, MESSAGING),
		nestjsPackages: matched(deps, WATCHED_PACKAGES),
	};
}
