import type { Metadata } from "next";

export const SITE_URL = "https://www.nestjs.doctor";
export const SITE_NAME = "NestJS Doctor";

export interface PageCopy {
	description: string;
	title: string;
}

/** Page metadata whose social card and og:url match the page's own canonical. */
export const pageMetadata = (
	path: string,
	{ title, description }: PageCopy
): Metadata => {
	const socialTitle = `${title} | ${SITE_NAME}`;

	return {
		title,
		description,
		openGraph: {
			title: socialTitle,
			description,
			url: `${SITE_URL}${path}`,
			siteName: SITE_NAME,
			type: "website",
		},
		twitter: {
			card: "summary_large_image",
			title: socialTitle,
			description,
		},
	};
};
