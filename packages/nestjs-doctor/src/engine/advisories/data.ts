/**
 * Published advisories against the official `@nestjs/*` packages, compared
 * against the versions a project declares.
 *
 * The table ships with the CLI on purpose: a scan makes no network calls, so
 * the same input has to produce the same output on a laptop, in CI, and on a
 * machine with no internet. The cost is that it is only as fresh as the last
 * release. Refresh it with, per package:
 *
 *   gh api "/advisories?ecosystem=npm&affects=@nestjs/core"
 *
 * Every entry below was taken from that endpoint, not from memory. Keep the
 * `ghsa` and `url` fields so the next person can re-check a claim in one click.
 */

export interface Advisory {
	/**
	 * Lowest affected version, inclusive. Present only where the advisory names
	 * one, as it does for the 11.x line of CVE-2024-29409.
	 */
	atLeast?: string;
	cve: string;
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
		packageName: "@nestjs/core",
		ghsa: "GHSA-36xv-jgw5-4q75",
		cve: "CVE-2026-35515",
		severity: "moderate",
		patched: "11.1.18",
		summary:
			"special elements are not neutralised in output used by a downstream component",
		url: "https://github.com/advisories/GHSA-36xv-jgw5-4q75",
	},
	{
		packageName: "@nestjs/core",
		ghsa: "GHSA-4jpv-8r57-pv7j",
		cve: "CVE-2023-26108",
		severity: "moderate",
		patched: "9.0.5",
		summary: "StreamableFile discloses information through its pipe",
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
		packageName: "@nestjs/common",
		ghsa: "GHSA-cj7v-w2c7-cp7c",
		cve: "CVE-2024-29409",
		severity: "moderate",
		patched: "10.4.16",
		summary: "a crafted Content-Type header reaches code execution",
		url: "https://github.com/advisories/GHSA-cj7v-w2c7-cp7c",
	},
];
