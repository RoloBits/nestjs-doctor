import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Desktop } from "@/components/macos/desktop";
import { pageMetadata } from "@/lib/site";
import { PERFECT_SCORE } from "@/lib/tui-theme";
import { certificateFromEntry } from "../../certificate";
import { CertificateScreen } from "../../certificate-screen";
import { type EntryParams, entryParams, findEntry } from "./entry";

export const dynamicParams = false;

export const generateStaticParams = (): EntryParams[] => entryParams();

export async function generateMetadata({
	params,
}: {
	params: Promise<EntryParams>;
}): Promise<Metadata> {
	const entry = findEntry(await params);
	if (!entry) {
		return {};
	}
	return {
		...pageMetadata(entry.shareUrl, {
			title: `${entry.name} scored ${entry.score}/${PERFECT_SCORE}`,
			description: `Certificate of health for ${entry.name}: ${entry.errorCount} errors, ${entry.warningCount} warnings across ${entry.fileCount} files, measured by nestjs-doctor at commit ${entry.commit.slice(0, 7)}.`,
		}),
		robots: { index: true, follow: true },
	};
}

const WINDOW_TITLE = "nestjs-doctor — certificate";

export default async function EntryCertificatePage({
	params,
}: {
	params: Promise<EntryParams>;
}) {
	const entry = findEntry(await params);
	if (!entry) {
		notFound();
	}
	return (
		<div className="h-dvh w-full bg-[#0a0a0a] font-mono text-base text-neutral-300 leading-relaxed">
			<h1 className="sr-only">{`Certificate of health for ${entry.name}`}</h1>
			<p className="sr-only">
				{`${entry.name} scored ${entry.score}/${PERFECT_SCORE} on nestjs-doctor.`}
			</p>
			<Desktop
				reopenLabel="Open certificate"
				section="Certificate"
				title={WINDOW_TITLE}
			>
				<CertificateScreen certificate={certificateFromEntry(entry)} />
			</Desktop>
		</div>
	);
}
