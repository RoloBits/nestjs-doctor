import { describe, expect, it } from "vitest";
import { detectEcosystem } from "../../src/telemetry/ecosystem.js";

describe("ecosystem detection", () => {
	it("names the known packages a project depends on", () => {
		const facts = detectEcosystem({
			"@nestjs/core": "^11.0.0",
			"@nestjs/mongoose": "^11.0.0",
			mongodb: "^6.0.0",
			react: "^19.0.0",
			bullmq: "^5.0.0",
			"@aws-sdk/client-s3": "^3.0.0",
		});

		expect(facts.nestjsPackages).toEqual(["@nestjs/core", "@nestjs/mongoose"]);
		expect(facts.databases).toEqual(["mongodb"]);
		expect(facts.frontend).toEqual(["react"]);
		expect(facts.messaging).toEqual(["bullmq"]);
		expect(facts.cloud).toEqual(["aws"]);
	});

	it("never reports a package outside the known lists", () => {
		const facts = detectEcosystem({
			"@acme/billing-core": "^1.0.0",
			"@acme/internal-auth": "^2.0.0",
			"super-secret-vendor-sdk": "^3.0.0",
			"@nestjs/core": "^11.0.0",
		});

		const serialized = JSON.stringify(facts);
		expect(serialized).not.toContain("acme");
		expect(serialized).not.toContain("secret");
		expect(facts.nestjsPackages).toEqual(["@nestjs/core"]);
	});

	it("collapses a cloud vendor's scope, and keeps the sub-services", () => {
		const facts = detectEcosystem({
			"@aws-sdk/client-dynamodb": "^3.0.0",
			"@aws-sdk/client-s3": "^3.0.0",
			"@aws-sdk/client-sqs": "^3.0.0",
			"@google-cloud/pubsub": "^4.0.0",
		});

		expect(facts.cloud).toEqual(["aws", "gcp"]);
		expect(facts.cloudServices).toEqual([
			"aws:client-dynamodb",
			"aws:client-s3",
			"aws:client-sqs",
			"gcp:pubsub",
		]);
	});

	it("covers the platform vendors", () => {
		const facts = detectEcosystem({
			"@vercel/blob": "^0.0.1",
			"@cloudflare/workers-types": "^4.0.0",
			wrangler: "^3.0.0",
			"@upstash/redis": "^1.0.0",
			"@netlify/functions": "^2.0.0",
		});

		expect(facts.cloud).toEqual([
			"cloudflare",
			"netlify",
			"upstash",
			"vercel",
			"wrangler",
		]);
		expect(facts.cloudServices).toContain("vercel:blob");
		expect(facts.cloudServices).toContain("cloudflare:workers-types");
	});

	it("reports the vendor but not an odd name aliased into its scope", () => {
		// A workspace package can be given any name locally, so the suffix is
		// only reported when it looks like a published package name.
		const facts = detectEcosystem({
			"@aws-sdk/client-s3": "^3.0.0",
			"@aws-sdk/../../acme-secret": "^1.0.0",
			"@aws-sdk/Internal Billing Wrapper": "^1.0.0",
		});

		expect(facts.cloud).toEqual(["aws"]);
		expect(facts.cloudServices).toEqual(["aws:client-s3"]);
		expect(JSON.stringify(facts)).not.toContain("acme");
	});

	it("reports nothing for a project with no known dependencies", () => {
		const facts = detectEcosystem({ "@acme/only-private": "^1.0.0" });

		expect(facts).toEqual({
			cloud: [],
			cloudServices: [],
			databases: [],
			frontend: [],
			messaging: [],
			nestjsPackages: [],
		});
	});

	it("survives a manifest with no dependencies at all", () => {
		expect(detectEcosystem().nestjsPackages).toEqual([]);
	});
});
