import { DOCS_NAV } from "@/lib/docs-navigation";

const SITE_URL = "https://www.nestjs.doctor";

export const SoftwareApplicationJsonLd = () => {
	const data = {
		"@context": "https://schema.org",
		"@type": "SoftwareApplication",
		name: "nestjs-doctor",
		description: "Diagnose and fix your NestJS code in one command.",
		url: SITE_URL,
		applicationCategory: "DeveloperApplication",
		operatingSystem: "Cross-platform",
		offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
	};

	return (
		<script
			// biome-ignore lint/security/noDangerouslySetInnerHtml: JSON-LD requires dangerouslySetInnerHTML
			dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
			type="application/ld+json"
		/>
	);
};

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
			dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
			type="application/ld+json"
		/>
	);
};
