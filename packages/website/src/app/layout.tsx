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

const HOME_TITLE = "NestJS Doctor - Deterministic static analysis for NestJS";
const HOME_DESCRIPTION =
	"nestjs-doctor is a free, open-source static analysis tool for NestJS. The deterministic NestJS devtool that catches AI mistakes: a health score, diagnostics and a CI gate, under MIT.";

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
