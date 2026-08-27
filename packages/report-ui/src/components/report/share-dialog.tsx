"use client";

import { useEffect, useState } from "react";
import type { ReportArtifact } from "@/lib/model/artifact";
import { buildSharedDoc, downloadSharedDoc } from "@/lib/share";

interface ShareDialogProps {
	artifact: ReportArtifact;
	onClose: () => void;
}

export function ShareDialog({ artifact, onClose }: ShareDialogProps) {
	const sections = artifact.share.sections;
	const [picked, setPicked] = useState<Set<string>>(
		() => new Set(sections.map((s) => s.id))
	);
	const includeCode = Object.keys(artifact.sources).length > 0;

	useEffect(() => {
		const onKey = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				onClose();
			}
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [onClose]);

	const toggle = (id: string) => {
		setPicked((prev) => {
			const next = new Set(prev);
			if (next.has(id)) {
				next.delete(id);
			} else {
				next.add(id);
			}
			return next;
		});
	};

	return (
		<div aria-hidden={false} className="dialog-backdrop">
			<button
				aria-label="Close share dialog"
				className="dialog-dismiss"
				onClick={onClose}
				type="button"
			/>
			<div className="dialog">
				<h3>Share this report</h3>
				<ul className="share-sections">
					{sections.map((section) => (
						<li key={section.id}>
							<label>
								<input
									checked={picked.has(section.id)}
									onChange={() => toggle(section.id)}
									type="checkbox"
								/>
								{section.label} ({section.count})
							</label>
						</li>
					))}
				</ul>
				<p className="panel-note">
					{includeCode
						? "Source snippets are included when you share findings."
						: "This scan carries no source text."}
				</p>
				<div className="dialog-actions">
					<button onClick={onClose} type="button">
						Cancel
					</button>
					<button
						className="primary"
						disabled={picked.size === 0}
						onClick={() => {
							downloadSharedDoc(buildSharedDoc(artifact, picked, includeCode));
							onClose();
						}}
						type="button"
					>
						Download JSON
					</button>
				</div>
			</div>
		</div>
	);
}
