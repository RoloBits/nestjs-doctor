import { WATCHED_PACKAGES } from "../engine/advisories/watched.js";

/** The only package names the payload may carry. */
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

/** Vendor scope prefixes, mapped to the vendor name the payload reports. */
const CLOUD_SCOPES: [string, string][] = [
	["@aws-sdk/", "aws"],
	["@azure/", "azure"],
	["@cloudflare/", "cloudflare"],
	["@google-cloud/", "gcp"],
	["@netlify/", "netlify"],
	["@upstash/", "upstash"],
	["@vercel/", "vercel"],
];

/** The only sub-service names the payload may carry, per vendor. */
const CLOUD_SERVICES: Record<string, readonly string[]> = {
	aws: [
		"client-cloudwatch",
		"client-dynamodb",
		"client-ec2",
		"client-eventbridge",
		"client-lambda",
		"client-rds",
		"client-s3",
		"client-secrets-manager",
		"client-ses",
		"client-sns",
		"client-sqs",
		"client-ssm",
		"client-step-functions",
		"lib-dynamodb",
		"s3-request-presigner",
	],
	azure: [
		"cosmos",
		"identity",
		"keyvault-secrets",
		"service-bus",
		"storage-blob",
		"storage-queue",
	],
	cloudflare: ["ai", "workers-types"],
	gcp: [
		"bigquery",
		"firestore",
		"logging",
		"pubsub",
		"secret-manager",
		"storage",
		"tasks",
	],
	netlify: ["blobs", "functions"],
	upstash: ["qstash", "ratelimit", "redis", "vector"],
	vercel: ["blob", "edge-config", "functions", "kv", "postgres"],
};

const MESSAGING: readonly string[] = ["amqplib", "bullmq", "kafkajs", "nats"];

export interface EcosystemFacts {
	cloud: string[];
	cloudServices: string[];
	databases: string[];
	frontend: string[];
	messaging: string[];
	nestjsPackages: string[];
}

const empty = (): EcosystemFacts => ({
	cloud: [],
	cloudServices: [],
	databases: [],
	frontend: [],
	messaging: [],
	nestjsPackages: [],
});

let detected: EcosystemFacts = empty();

const union = (a: string[], b: string[]): string[] =>
	[...new Set([...a, ...b])].sort();

/** Unions each project's packages, since a monorepo detects them separately. */
export const addEcosystem = (facts: EcosystemFacts): void => {
	detected = {
		cloud: union(detected.cloud, facts.cloud),
		cloudServices: union(detected.cloudServices, facts.cloudServices),
		databases: union(detected.databases, facts.databases),
		frontend: union(detected.frontend, facts.frontend),
		messaging: union(detected.messaging, facts.messaging),
		nestjsPackages: union(detected.nestjsPackages, facts.nestjsPackages),
	};
};

/** Clears what a previous scan saw, for a process that scans more than once. */
export const resetEcosystem = (): void => {
	detected = empty();
};

export const getEcosystem = (): EcosystemFacts => detected;

const matched = (deps: Record<string, string>, list: readonly string[]) =>
	list.filter((name) => deps[name]).sort();

/** Which known packages a project depends on. Returns nothing outside the lists above. */
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
		if (CLOUD_SERVICES[vendor]?.includes(service)) {
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
