/**
 * Published advisories against the packages in `WATCHED_PACKAGES`.
 *
 * Refresh with `pnpm advisories:check`, which walks that list and reports what
 * this table is missing. Skip any record carrying `withdrawn_at`, and map
 * GitHub's `medium` to `moderate`; `matchAdvisories` filters on exact severity
 * membership. Where a record's `vulnerable_version_range` and its
 * `first_patched_version` disagree, take the wider bound.
 */

export interface Advisory {
	/**
	 * Lowest affected version, inclusive. Present only where the advisory names
	 * one, as it does for the 11.x line of CVE-2024-29409.
	 */
	atLeast?: string;
	/** Absent where the advisory was never assigned one. */
	cve?: string;
	ghsa: string;
	packageName: string;
	/** Affected means below this. Every range in the source reduces to it. */
	patched: string;
	severity: "critical" | "high" | "moderate" | "low";
	summary: string;
	url: string;
}

export const NESTJS_ADVISORIES: readonly Advisory[] = [
	{
		packageName: "@nestjs/devtools-integration",
		ghsa: "GHSA-85cg-cmq5-qjm7",
		cve: "CVE-2025-54782",
		severity: "critical",
		patched: "0.2.1",
		summary:
			"a cross-site request forgery escapes the sandbox and runs arbitrary code on the developer's machine",
		url: "https://github.com/advisories/GHSA-85cg-cmq5-qjm7",
	},
	{
		packageName: "@nestjs/platform-fastify",
		ghsa: "GHSA-6v32-fjc9-9qf6",
		cve: "CVE-2026-54281",
		severity: "high",
		patched: "11.1.24",
		summary:
			"middleware is bypassed, so a guarded route can be reached unauthenticated",
		url: "https://github.com/advisories/GHSA-6v32-fjc9-9qf6",
	},
	{
		packageName: "@nestjs/platform-fastify",
		ghsa: "GHSA-wf42-42fg-fg84",
		cve: "CVE-2026-33011",
		severity: "high",
		patched: "11.1.16",
		summary: "a HEAD request bypasses middleware bound with forRoutes",
		url: "https://github.com/advisories/GHSA-wf42-42fg-fg84",
	},
	{
		packageName: "@nestjs/platform-fastify",
		ghsa: "GHSA-r4wm-x892-vjmx",
		cve: "CVE-2026-2293",
		severity: "high",
		patched: "11.1.14",
		summary: "a URL-encoded path bypasses middleware bound with forRoutes",
		url: "https://github.com/advisories/GHSA-r4wm-x892-vjmx",
	},
	{
		packageName: "@nestjs/platform-fastify",
		ghsa: "GHSA-8wpr-639p-ccrj",
		cve: "CVE-2025-69211",
		severity: "moderate",
		patched: "11.1.11",
		summary: "a trailing slash bypasses middleware bound with forRoutes",
		url: "https://github.com/advisories/GHSA-8wpr-639p-ccrj",
	},
	{
		packageName: "@nestjs/microservices",
		ghsa: "GHSA-hpwf-8g29-85qm",
		cve: "CVE-2026-40879",
		severity: "high",
		patched: "11.1.19",
		summary:
			"a malformed frame stalls JsonSocket, denying service to the transport",
		url: "https://github.com/advisories/GHSA-hpwf-8g29-85qm",
	},
	{
		packageName: "@nestjs/core",
		ghsa: "GHSA-36xv-jgw5-4q75",
		cve: "CVE-2026-35515",
		severity: "moderate",
		patched: "11.1.18",
		summary:
			"an unescaped newline in an SSE field lets an attacker spoof event types",
		url: "https://github.com/advisories/GHSA-36xv-jgw5-4q75",
	},
	{
		packageName: "@nestjs/core",
		ghsa: "GHSA-4jpv-8r57-pv7j",
		cve: "CVE-2023-26108",
		severity: "moderate",
		patched: "9.0.5",
		summary:
			"a cancelled download leaves the StreamableFile stream open, disclosing data",
		url: "https://github.com/advisories/GHSA-4jpv-8r57-pv7j",
	},
	{
		packageName: "@nestjs/common",
		ghsa: "GHSA-cj7v-w2c7-cp7c",
		cve: "CVE-2024-29409",
		severity: "moderate",
		atLeast: "11.0.0-next.1",
		patched: "11.0.16",
		summary: "a crafted Content-Type header reaches code execution",
		url: "https://github.com/advisories/GHSA-cj7v-w2c7-cp7c",
	},
	{
		packageName: "@sentry/nestjs",
		ghsa: "GHSA-6465-jgvq-jhgp",
		cve: "CVE-2025-65944",
		severity: "moderate",
		atLeast: "10.11.0",
		patched: "10.27.0",
		summary:
			"sensitive headers are sent to Sentry when sendDefaultPii is enabled",
		url: "https://github.com/advisories/GHSA-6465-jgvq-jhgp",
	},
	{
		packageName: "@sentry/nestjs",
		ghsa: "GHSA-r5w7-f542-q2j4",
		severity: "low",
		atLeast: "8.10.0",
		patched: "8.49.0",
		summary:
			"the ContextLines integration reads source files on every event, which can exhaust the event loop",
		url: "https://github.com/advisories/GHSA-r5w7-f542-q2j4",
	},
	{
		packageName: "@nestjs/common",
		ghsa: "GHSA-cj7v-w2c7-cp7c",
		cve: "CVE-2024-29409",
		severity: "moderate",
		patched: "10.4.16",
		summary: "a crafted Content-Type header reaches code execution",
		url: "https://github.com/advisories/GHSA-cj7v-w2c7-cp7c",
	},
];
