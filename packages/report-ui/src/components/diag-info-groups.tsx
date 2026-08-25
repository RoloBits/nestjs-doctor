import type { Diagnostic } from "../model";
import type { FileEntry } from "../selectors";

function Location({ d }: { d: Diagnostic }) {
	if ("line" in d) {
		return (
			<span className="diag-linecol">
				Ln {d.line}, Col {d.column}
			</span>
		);
	}
	if ("entity" in d) {
		return (
			<span className="diag-linecol">
				{d.entity}
				{d.schemaColumn ? `.${d.schemaColumn}` : ""}
			</span>
		);
	}
	return null;
}

/** Diagnostics grouped by rule + help, mirroring the legacy info stack. */
export function DiagInfoGroups({
	examples,
	entries,
}: {
	entries: FileEntry[];
	examples: Record<string, { bad: string; good: string }>;
}) {
	const groups: Array<{
		rule: string;
		help: string | null;
		entries: FileEntry[];
	}> = [];
	const seen = new Map<
		string,
		{ rule: string; help: string | null; entries: FileEntry[] }
	>();
	for (const entry of entries) {
		const key = `${entry.d.rule}\u0000${entry.d.help ?? ""}`;
		const group = seen.get(key);
		if (group) {
			group.entries.push(entry);
		} else {
			const fresh = {
				rule: entry.d.rule,
				help: entry.d.help || null,
				entries: [entry],
			};
			groups.push(fresh);
			seen.set(key, fresh);
		}
	}

	return (
		<div>
			{groups.map((group) => {
				const example = examples[group.rule];
				return (
					<div className="diag-info-item" key={group.rule}>
						{group.entries.map((entry) => {
							const d = entry.d;
							return (
								<div key={entry.origIdx}>
									<div className="diag-info-header">
										<div
											className="sev-dot"
											style={{ background: `var(--sev-${d.severity})` }}
										/>
										<span className={`code-sev-badge ${d.severity}`}>
											{d.severity}
										</span>
										<span className="code-rule-badge">{d.rule}</span>
										{isNotScoredBudget(d) && (
											<span className="code-notscored-badge">not scored</span>
										)}
										<Location d={d} />
									</div>
									<div className="diag-info-msg">{d.message}</div>
								</div>
							);
						})}
						{group.help && (
							<div className="diag-info-help">
								<div className="section-label">Recommendation</div>
								{group.help}
							</div>
						)}
						{example && (
							<div className="diag-info-examples">
								<div className="section-label">Examples</div>
								<div className="examples-group">
									<div className="example-block bad">
										<div className="example-tag bad">Bad</div>
										<pre className="example-code">{example.bad}</pre>
									</div>
									<div className="example-block good">
										<div className="example-tag good">Good</div>
										<pre className="example-code">{example.good}</pre>
									</div>
								</div>
							</div>
						)}
					</div>
				);
			})}
		</div>
	);
}

function isNotScoredBudget(d: Diagnostic): boolean {
	return !!d.surfaces && !d.surfaces.includes("score");
}
