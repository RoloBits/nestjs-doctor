import type { MetadataRoute } from "next";
import { LEADERBOARD_ENTRIES } from "@/app/leaderboard/leaderboard-entries";
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

	const certificateRoutes = LEADERBOARD_ENTRIES.map((entry) => ({
		url: `${SITE_URL}${entry.shareUrl}`,
		changeFrequency: "weekly" as const,
		priority: 0.6,
	}));

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
		...certificateRoutes,
	];
}
