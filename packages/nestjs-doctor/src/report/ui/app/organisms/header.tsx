import { useEffect, useState } from "react";
import type { ReportArtifact } from "../../../../common/artifact.js";
import { buildSharedJson, scoredCount } from "../../browser/share-payload.js";
import { formatMs, phaseParts } from "../../browser/trace.js";
import { TextButton } from "../atoms/button.js";
import { jumpToSlowestBoot } from "../templates/modules.js";

function track(event: string): void {
	(globalThis as { __ndTrack?: (e: string) => void }).__ndTrack?.(event);
}

function switchTab(name: string): void {
	(globalThis as { switchTab?: (name: string) => void }).switchTab?.(name);
}

function bootBadge(report: ReportArtifact): {
	label: string;
	tip: string;
} | null {
	const graph = report.graph;
	if (!graph.timingsAvailable) {
		return null;
	}
	let bootMs = 0;
	let bootName = "";
	for (const node of Object.values(graph.timingsTrace ?? {})) {
		if (node.initTime > bootMs) {
			bootMs = node.initTime;
			bootName = node.name;
		}
	}
	if (graph.startupMs) {
		const phaseCaption = phaseParts(graph)
			.map((s) => `${s.label} ${formatMs(s.ms)}`)
			.join(" · ");
		return {
			label: `time to start ≈ ${formatMs(graph.startupMs)}`,
			tip:
				"From bootstrap start until the app was listening, measured by the nestjs-doctor snippet in your main.ts." +
				(phaseCaption ? ` ${phaseCaption}.` : "") +
				` Slowest construction chain: ${bootName} — click to open it in the modules graph`,
		};
	}
	if (bootMs > 0) {
		return {
			label: `boot ≈ ${formatMs(bootMs)}`,
			tip: `Slowest construction chain: ${bootName} — click to open it in the modules graph. Add startupMs to the dump for full time-to-start`,
		};
	}
	return null;
}

function downloadSharedJson(data: unknown): void {
	const blob = new Blob([JSON.stringify(data, null, 2)], {
		type: "application/json",
	});
	const a = document.createElement("a");
	a.href = URL.createObjectURL(blob);
	a.download = "nestjs-doctor-shared.json";
	document.body.appendChild(a);
	a.click();
	document.body.removeChild(a);
	URL.revokeObjectURL(a.href);
}

function ShareDialog({
	report,
	onClose,
}: {
	onClose: () => void;
	report: ReportArtifact;
}) {
	const share = report.share;
	const visibleSections = share.sections
		.map((section) => {
			let count = scoredCount(share, section.id);
			if (count === null) {
				count = section.count;
			}
			return { section, count };
		})
		.filter((row) => row.count !== 0);
	const [picked, setPicked] = useState<ReadonlySet<string>>(
		new Set(visibleSections.map((row) => row.section.id))
	);
	const [includeCode, setIncludeCode] = useState(false);

	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				onClose();
			}
		};
		document.addEventListener("keydown", onKey);
		return () => document.removeEventListener("keydown", onKey);
	}, [onClose]);

	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: clicking the backdrop closes, as in the report's CSS
		// biome-ignore lint/a11y/noNoninteractiveElementInteractions: clicking the backdrop closes, as in the report's CSS
		// biome-ignore lint/a11y/useKeyWithClickEvents: Escape already closes the overlay
		<div
			className="share-overlay"
			id="share-overlay"
			onClick={(e) => {
				if (e.target === e.currentTarget) {
					onClose();
				}
			}}
		>
			<div className="share-panel" id="share-panel">
				<div className="share-title">Share the report</div>
				{visibleSections.map(({ section, count }) => (
					<label className="share-row" key={section.id}>
						<input
							checked={picked.has(section.id)}
							className="share-section"
							onChange={(e) =>
								setPicked((prev) => {
									const next = new Set(prev);
									if (e.target.checked) {
										next.add(section.id);
									} else {
										next.delete(section.id);
									}
									return next;
								})
							}
							type="checkbox"
							value={section.id}
						/>{" "}
						{section.label} ({count})
					</label>
				))}
				<label className="share-row" style={{ marginTop: 4 }}>
					<input
						checked={includeCode}
						id="share-code"
						onChange={(e) => setIncludeCode(e.target.checked)}
						type="checkbox"
					/>{" "}
					Include code snippets{" "}
					<span className="share-hint">a few lines around each finding</span>
				</label>
				<div className="share-actions">
					<TextButton
						classes="share-download"
						id="share-download"
						onClick={() => {
							if (picked.size === 0) {
								return;
							}
							const data = buildSharedJson(
								share,
								report.generator,
								includeCode,
								[...picked]
							);
							downloadSharedJson(data);
							onClose();
						}}
					>
						Download .json
					</TextButton>
				</div>
			</div>
		</div>
	);
}

export function HeaderRow({ report }: { report: ReportArtifact }) {
	const [shareOpen, setShareOpen] = useState(false);
	const project = report.project;
	const boot = bootBadge(report);
	return (
		<>
			<div className="brand">
				{/* biome-ignore lint/performance/noImgElement: the report is a static page with no image pipeline */}
				<img
					alt="nestjs-doctor logo"
					height={22}
					src="https://nestjs.doctor/logo.png"
					style={{ borderRadius: 4 }}
					width={22}
				/>
				nestjs-doctor
			</div>
			<div className="meta" id="header-meta">
				<span className="meta-badge">{project.name}</span>
				{project.nestVersion && (
					<span className="meta-badge">NestJS {project.nestVersion}</span>
				)}
				{project.framework && (
					<span className="meta-badge">{project.framework}</span>
				)}
				{project.orm && <span className="meta-badge">{project.orm}</span>}
				<span className="meta-badge">
					{report.graph.modules.length} modules
				</span>
				{boot && (
					// biome-ignore lint/a11y/noStaticElementInteractions: the badge is the click target, as in the report's CSS
					// biome-ignore lint/a11y/noNoninteractiveElementInteractions: the badge is the click target, as in the report's CSS
					// biome-ignore lint/a11y/useKeyWithClickEvents: matches the shipped report's mouse-only badge
					<span
						className="meta-badge"
						data-tip={boot.tip}
						id="boot-badge"
						onClick={() => {
							track("boot_trace_opened");
							switchTab("modules");
							jumpToSlowestBoot();
						}}
						style={{ cursor: "pointer" }}
					>
						{boot.label}
					</span>
				)}
			</div>
			<div className="spacer" />
			<div className="nav-actions">
				<TextButton
					classes="nav-btn"
					id="nav-share"
					onClick={() => setShareOpen((prev) => !prev)}
				>
					share
				</TextButton>
				<a
					className="nav-btn"
					href="https://nestjs.doctor/docs"
					rel="noopener"
					target="_blank"
				>
					docs
				</a>
				<a
					className="nav-btn"
					href="https://github.com/RoloBits/nestjs-doctor"
					rel="noopener"
					target="_blank"
				>
					github
				</a>
			</div>
			{shareOpen && (
				<ShareDialog onClose={() => setShareOpen(false)} report={report} />
			)}
		</>
	);
}
