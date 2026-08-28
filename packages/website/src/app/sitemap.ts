import type { MetadataRoute } from "next";
import { DOCS_NAV } from "@/lib/docs-navigation";
import { SITE_URL } from "@/lib/site";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
	const docRoutes = DOCS_NAV.flatMap((section) =>
		section.items.map((item) => ({
			url: `${SITE_URL}${item.href}`,
			changeFrequency: "weekly" as const,
			priority: 0.7,
		}))
	);

	return [
		{
			url: SITE_URL,
			changeFrequency: "monthly",
			priority: 1,
		},
		{
			url: `${SITE_URL}/leaderboard`,
			changeFrequency: "weekly",
			priority: 0.8,
		},
		{
			url: `${SITE_URL}/report`,
			changeFrequency: "monthly",
			priority: 0.8,
		},
		...docRoutes,
	];
}
