import type { Metadata } from "next";
import { IBM_Plex_Mono } from "next/font/google";
import { SiteAnalytics } from "@/components/site-analytics";
import { SITE_NAME, SITE_URL } from "@/lib/site";
import "./globals.css";

const ibmPlexMono = IBM_Plex_Mono({
	variable: "--font-mono",
	subsets: ["latin"],
	weight: ["200", "400", "500", "700"],
});

const HOME_TITLE =
	"NestJS Doctor - The deterministic NestJS devtool that catches AI mistakes";
const HOME_DESCRIPTION =
	"The deterministic NestJS devtool that catches AI mistakes. Static analysis for NestJS with a health score, diagnostics and a CI gate.";

export const metadata: Metadata = {
	metadataBase: new URL(SITE_URL),
	title: {
		default: HOME_TITLE,
		template: `%s | ${SITE_NAME}`,
	},
	description: HOME_DESCRIPTION,
	alternates: { canonical: "./" },
	openGraph: {
		title: HOME_TITLE,
		description: HOME_DESCRIPTION,
		url: SITE_URL,
		siteName: SITE_NAME,
		type: "website",
	},
	twitter: {
		card: "summary_large_image",
		title: HOME_TITLE,
		description: HOME_DESCRIPTION,
	},
	icons: {
		icon: [{ url: "/favicon.png", type: "image/png" }],
		apple: "/logo.png",
	},
};

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<html data-scroll-behavior="smooth" lang="en">
			<body
				className={`${ibmPlexMono.variable} antialiased`}
				suppressHydrationWarning
			>
				{children}
				<SiteAnalytics />
			</body>
		</html>
	);
}
