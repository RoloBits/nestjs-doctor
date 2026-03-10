import type { Metadata } from "next";
import { IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

const ibmPlexMono = IBM_Plex_Mono({
	variable: "--font-mono",
	subsets: ["latin"],
	weight: ["400", "500"],
});

const SITE_URL = "https://www.nestjs.doctor";
const TWITTER_IMAGE_PATH = "/nestjs-doctor-og-banner.png";

export const metadata: Metadata = {
	metadataBase: new URL(SITE_URL),
	title: {
		default: "NestJS Doctor - Diagnose and Fix Your NestJS Code",
		template: "%s | NestJS Doctor",
	},
	description: "Diagnose and fix your NestJS code in one command.",
	alternates: { canonical: "./" },
	openGraph: {
		title: "NestJS Doctor - Diagnose and Fix Your NestJS Code",
		description: "Diagnose and fix your NestJS code in one command.",
		url: SITE_URL,
		siteName: "NestJS Doctor",
		type: "website",
		images: [
			{
				url: TWITTER_IMAGE_PATH,
				width: 1200,
				height: 630,
				alt: "NestJS Doctor - Diagnose and fix your NestJS code",
			},
		],
	},
	twitter: {
		card: "summary_large_image",
		images: [TWITTER_IMAGE_PATH],
	},
	icons: { icon: "/favicon.svg" },
};

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<html lang="en">
			<body
				className={`${ibmPlexMono.variable} antialiased`}
				suppressHydrationWarning
			>
				{children}
			</body>
		</html>
	);
}
