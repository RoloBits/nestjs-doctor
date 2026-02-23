import type { Metadata } from "next";
import { IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

const ibmPlexMono = IBM_Plex_Mono({
	variable: "--font-mono",
	subsets: ["latin"],
	weight: ["400", "500"],
});

const SITE_URL = "https://www.nestjs.doctor";
const TWITTER_IMAGE_PATH = "/nestjs-doctor-og-banner.svg";

export const metadata: Metadata = {
	metadataBase: new URL(SITE_URL),
	title: "NestJS Doctor",
	description: "Diagnose and fix your NestJS code in one command.",
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
