import type { Severity } from "../../../../common/diagnostic.js";

const SEV_VAR: Record<Severity, string> = {
	error: "var(--sev-error)",
	warning: "var(--sev-warning)",
	info: "var(--sev-info)",
};

// The file view's title block: name, parent directory, severity counts.
export function FileHeader({
	filePath,
	severities,
}: {
	filePath: string;
	severities: Severity[];
}) {
	const parts = filePath.split("/");
	const fileName = parts.pop();
	const parentDir = parts.join("/");
	const counts = { error: 0, warning: 0, info: 0 };
	for (const sev of severities) {
		counts[sev]++;
	}
	return (
		<>
			<div className="file-view-title">{fileName}</div>
			{parentDir && <div className="file-view-dir">{parentDir}/</div>}
			<div className="file-view-counts">
				{counts.error > 0 && (
					<span>
						<span
							className="fv-count-dot"
							style={{ background: SEV_VAR.error }}
						/>
						{counts.error} error{counts.error !== 1 ? "s" : ""}
					</span>
				)}
				{counts.warning > 0 && (
					<span>
						<span
							className="fv-count-dot"
							style={{ background: SEV_VAR.warning }}
						/>
						{counts.warning} warning{counts.warning !== 1 ? "s" : ""}
					</span>
				)}
				{counts.info > 0 && (
					<span>
						<span
							className="fv-count-dot"
							style={{ background: SEV_VAR.info }}
						/>
						{counts.info} info
					</span>
				)}
			</div>
		</>
	);
}
