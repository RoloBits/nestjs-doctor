import type { Metadata } from "next";
import { pageMetadata } from "@/lib/site";

export const metadata: Metadata = pageMetadata("/report", {
	title: "Report Viewer",
	description:
		"Open a nestjs-doctor report or shared file in the browser. Files are read locally and never uploaded.",
});

export default function ReportLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return children;
}
