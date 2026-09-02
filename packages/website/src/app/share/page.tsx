import { Suspense } from "react";
import { Desktop } from "@/components/macos/desktop";
import { QueryCertificateScreen } from "./certificate-screen";

const WINDOW_TITLE = "nestjs-doctor — certificate";

const SharePage = () => (
	<div className="h-dvh w-full bg-[#0a0a0a] font-mono text-base text-neutral-300 leading-relaxed">
		<h1 className="sr-only">Certificate of health</h1>
		<p className="sr-only">
			A health score that nestjs-doctor measured for one NestJS codebase.
		</p>
		<Desktop
			reopenLabel="Open certificate"
			section="Certificate"
			title={WINDOW_TITLE}
		>
			<Suspense>
				<QueryCertificateScreen />
			</Suspense>
		</Desktop>
	</div>
);

export default SharePage;
