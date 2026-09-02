import { DOCS_PAGES } from "@/lib/docs-metadata";
import { SITE_URL } from "@/lib/site";

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
	description:
		"The deterministic NestJS devtool that catches AI mistakes. Static analysis for NestJS with a health score, diagnostics and a CI gate.",
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

	const parent = path.slice(0, path.lastIndexOf("/"));
	const parentPage = parent === "/docs" ? undefined : DOCS_PAGES[parent];

	if (parentPage) {
		items.push({ name: parentPage.title, href: parent });
	}

	if (path !== "/docs" && DOCS_PAGES[path]) {
		items.push({ name: DOCS_PAGES[path].title, href: path });
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
