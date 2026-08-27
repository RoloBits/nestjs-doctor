"use client";

import { useEffect, useState } from "react";
import { ReportApp } from "@/components/report/report-app";
import { loadArtifact } from "@/lib/get-artifact";
import type { ReportArtifact } from "@/lib/model/artifact";

export default function Page() {
	const [artifact, setArtifact] = useState<ReportArtifact | null>(null);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		let active = true;
		loadArtifact()
			.then((value) => {
				if (active) {
					setArtifact(value);
				}
			})
			.catch((cause: unknown) => {
				if (active) {
					setError(cause instanceof Error ? cause.message : String(cause));
				}
			});
		return () => {
			active = false;
		};
	}, []);

	if (error) {
		return (
			<main className="report-error">
				Report artifact not embedded: {error}
			</main>
		);
	}

	if (!artifact) {
		return (
			<main className="report-loading">
				<div className="loading-ring" />
			</main>
		);
	}

	return <ReportApp artifact={artifact} />;
}
