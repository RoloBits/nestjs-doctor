import { useEffect, useState } from "react";
import type { ReportArtifact } from "../../../../common/artifact.js";
import { TextButton } from "../atoms/button.js";
import { installFloatTip } from "../lib/float-tip.js";
import { buildSharedJson, scoredCount } from "../lib/share-payload.js";
import { Modal } from "../molecules/modal.js";

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
		() => new Set(visibleSections.map((row) => row.section.id))
	);
	const [includeCode, setIncludeCode] = useState(false);

	return (
		<Modal
			onClose={onClose}
			overlayId="share-overlay"
			panelClasses="share-panel"
			panelId="share-panel"
		>
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
							{
								name: report.generator.name,
								version: report.generator.version,
							},
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
		</Modal>
	);
}

export function HeaderRow({
	hideShare,
	onLoadAnother,
	report,
}: {
	hideShare?: boolean;
	onLoadAnother?: () => void;
	report: ReportArtifact;
}) {
	const [shareOpen, setShareOpen] = useState(false);
	useEffect(() => {
		installFloatTip();
	}, []);
	const project = report.project;
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
				{report.graph.modules.length > 0 && (
					<span className="meta-badge">
						{report.graph.modules.length} modules
					</span>
				)}
			</div>
			<div className="spacer" />
			<div className="nav-actions">
				{onLoadAnother && (
					<TextButton classes="nav-btn" id="nav-load" onClick={onLoadAnother}>
						load file
					</TextButton>
				)}
				{!hideShare && (
					<TextButton
						classes="nav-btn"
						id="nav-share"
						onClick={() => setShareOpen((prev) => !prev)}
					>
						share
					</TextButton>
				)}
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
