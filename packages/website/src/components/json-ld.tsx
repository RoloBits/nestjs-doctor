import { DOCS_NAV } from "@/lib/docs-navigation";

const SITE_URL = "https://www.nestjs.doctor";

const HTML_UNSAFE = /[<>&\u2028\u2029]/g;
const ESCAPES: Record<string, string> = {
	"<": "\\u003c",
	">": "\\u003e",
	"&": "\\u0026",
	"\u2028": "\\u2028",
	"\u2029": "\\u2029",
};

/** JSON for a <script> body, with the characters that could end the tag escaped. */
const jsonForScript = (data: unknown): string =>
	JSON.stringify(data).replace(HTML_UNSAFE, (c) => ESCAPES[c]);

const SOFTWARE_APPLICATION = {
	"@context": "https://schema.org",
	"@type": "SoftwareApplication",
	name: "nestjs-doctor",
	description: "Diagnose and fix your NestJS code in one command.",
	url: SITE_URL,
	applicationCategory: "DeveloperApplication",
	operatingSystem: "Cross-platform",
	offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
};

export const SoftwareApplicationJsonLd = () => (
	<script
		// biome-ignore lint/security/noDangerouslySetInnerHtml: JSON-LD requires dangerouslySetInnerHTML
		dangerouslySetInnerHTML={{ __html: jsonForScript(SOFTWARE_APPLICATION) }}
		type="application/ld+json"
	/>
);

export const BreadcrumbJsonLd = ({ path }: { path: string }) => {
	const items: { name: string; href: string }[] = [
		{ name: "Docs", href: "/docs" },
	];

	if (path !== "/docs") {
		for (const section of DOCS_NAV) {
			for (const item of section.items) {
				if (item.href === path) {
					if (path.startsWith("/docs/pipeline") && path !== "/docs/pipeline") {
						items.push({ name: "Pipeline", href: "/docs/pipeline" });
					} else if (path.startsWith("/docs/rules") && path !== "/docs/rules") {
						items.push({ name: "Rules", href: "/docs/rules" });
					}
					items.push({ name: item.title, href: item.href });
					break;
				}
			}
		}
	}

	const data = {
		"@context": "https://schema.org",
		"@type": "BreadcrumbList",
		itemListElement: items.map((item, index) => ({
			"@type": "ListItem",
			position: index + 1,
			name: item.name,
			item: `${SITE_URL}${item.href}`,
		})),
	};

	return (
		<script
			// biome-ignore lint/security/noDangerouslySetInnerHtml: JSON-LD requires dangerouslySetInnerHTML
			dangerouslySetInnerHTML={{ __html: jsonForScript(data) }}
			type="application/ld+json"
		/>
	);
};
