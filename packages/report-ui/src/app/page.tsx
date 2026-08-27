"use client";

import { useEffect, useState } from "react";
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

	return (
		<main className="report-root">
			<header className="report-header">
				<h1>nestjs-doctor — {artifact.project.name}</h1>
				<span
					className={`score-badge ${artifact.score.value >= 80 ? "good" : "warn"}`}
				>
					{artifact.score.value} · {artifact.score.label}
				</span>
			</header>
			<p className="report-meta">
				{artifact.summary.total} findings · nest{" "}
				{artifact.project.nestVersion ?? "?"} · {artifact.generator.name} v
				{artifact.generator.version} · generated{" "}
				{new Date(artifact.generatedAt).toLocaleString()}
			</p>
		</main>
	);
}
