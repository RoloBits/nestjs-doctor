import type { Metadata } from "next";

export const SITE_URL = "https://www.nestjs.doctor";
export const SITE_NAME = "NestJS Doctor";
export const OG_IMAGE_PATH = "/nestjs-doctor-og-banner.png";
export const OG_IMAGE_ALT = "NestJS Doctor - Diagnose and fix your NestJS code";

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
			images: [
				{
					url: OG_IMAGE_PATH,
					width: 1200,
					height: 630,
					alt: OG_IMAGE_ALT,
				},
			],
		},
		twitter: {
			card: "summary_large_image",
			title: socialTitle,
			description,
			images: [OG_IMAGE_PATH],
		},
	};
};
