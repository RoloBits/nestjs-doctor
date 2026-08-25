import type { CodeDiagnostic, SourceLine } from "../model";
import type { FileEntry } from "../selectors";

const EXPAND_STEP = 20;

interface SegmentFinding {
	line: number;
	message: string;
	rule: string;
	severity: string;
}

interface Segment {
	end: number;
	findings: SegmentFinding[];
	start: number;
}

function worstOf(
	findings?: SegmentFinding[]
): "error" | "warning" | "info" | null {
	if (!findings) {
		return null;
	}
	if (findings.some((f) => f.severity === "error")) {
		return "error";
	}
	if (findings.some((f) => f.severity === "warning")) {
		return "warning";
	}
	return "info";
}

function buildSegments(
	sorted: FileEntry[],
	sourceLines: Array<SourceLine[] | null>,
	totalLines: number,
	fileExpand: { above: number; below: number }
): Segment[] {
	const segments: Segment[] = [];
	for (const entry of sorted) {
		if (!("line" in entry.d)) {
			continue;
		}
		const sl = sourceLines[entry.origIdx];
		let segStart: number;
		let segEnd: number;
		if (sl && sl.length > 0) {
			segStart = sl[0].line;
			segEnd = sl.at(-1)?.line ?? segStart;
		} else {
			const line = entry.d.line;
			segStart = Math.max(1, line - 3);
			segEnd = Math.min(totalLines, line + 3);
		}
		const finding: SegmentFinding = {
			line: entry.d.line,
			rule: entry.d.rule,
			message: entry.d.message,
			severity: entry.d.severity,
		};
		const prev = segments.at(-1);
		if (prev && segStart <= prev.end + 4) {
			prev.end = Math.max(prev.end, segEnd);
			prev.findings.push(finding);
			continue;
		}
		segments.push({ start: segStart, end: segEnd, findings: [finding] });
	}
	if (segments.length > 0) {
		const first = segments[0];
		const last = segments.at(-1) as Segment;
		first.start = Math.max(1, first.start - fileExpand.above);
		last.end = Math.min(totalLines, last.end + fileExpand.below);
	}
	return segments;
}

function CodeSegment({
	allLines,
	segment,
}: {
	allLines: string[];
	segment: Segment;
}) {
	const lines = allLines.slice(segment.start - 1, segment.end);
	const byLine = new Map<number, SegmentFinding[]>();
	for (const finding of segment.findings) {
		const list = byLine.get(finding.line) ?? [];
		list.push(finding);
		byLine.set(finding.line, list);
	}
	return (
		<div className="code-segment">
			{lines.map((text, i) => {
				const lineNo = segment.start + i;
				const findings = byLine.get(lineNo);
				const worst = worstOf(findings);
				return (
					<div
						className={worst ? `code-line hl-${worst}` : "code-line"}
						key={lineNo}
					>
						<span className="line-no">{lineNo}</span>
						<span className="line-text">{text || " "}</span>
					</div>
				);
			})}
			{[...byLine.entries()].map(([lineNo, findings]) => (
				<div className="code-line-findings" key={`f${lineNo}`}>
					{findings.map((f) => (
						<div className="code-finding" key={`${f.rule}:${f.line}`}>
							<span className={`code-sev-badge ${f.severity}`}>
								{f.severity}
							</span>
							<span className="code-rule-badge">{f.rule}</span>
							<span className="code-finding-msg">{f.message}</span>
						</div>
					))}
				</div>
			))}
		</div>
	);
}

export function CodeView({
	fileExpand,
	fullSource,
	onExpandAbove,
	onExpandBelow,
	sortedEntries,
	sourceLines,
}: {
	fileExpand: { above: number; below: number };
	fullSource: string | undefined;
	onExpandAbove: () => void;
	onExpandBelow: () => void;
	sortedEntries: FileEntry[];
	sourceLines: Array<SourceLine[] | null>;
}) {
	const hasSnippet =
		sortedEntries.find((e) => (sourceLines[e.origIdx]?.length ?? 0) > 0) !==
		undefined;

	if (!fullSource) {
		if (!hasSnippet) {
			return <div className="no-source-msg">Source code not available</div>;
		}
		const withSource = sortedEntries.find(
			(e) => (sourceLines[e.origIdx]?.length ?? 0) > 0
		) as FileEntry;
		const sl = sourceLines[withSource.origIdx] as SourceLine[];
		const first = sl[0].line;
		const findings = sortedEntries
			.filter((e): e is FileEntry & { d: CodeDiagnostic } => "line" in e.d)
			.map((e) => ({
				line: e.d.line,
				message: e.d.message,
				rule: e.d.rule,
				severity: e.d.severity,
			}));
		return (
			<CodeSegment
				allLines={sl.map((s) => s.text)}
				segment={{ start: first, end: first + sl.length - 1, findings }}
			/>
		);
	}

	const allLines = fullSource.split("\n");
	const segments = buildSegments(
		sortedEntries,
		sourceLines,
		allLines.length,
		fileExpand
	);
	const last = segments.at(-1);

	return (
		<div>
			{segments[0] && segments[0].start > 1 && (
				<button
					className="code-expand-row"
					onClick={onExpandAbove}
					type="button"
				>
					{"\u2191"} Expand {Math.min(EXPAND_STEP, segments[0].start - 1)} lines
				</button>
			)}
			{segments.map((segment, i) => (
				<div key={segment.start}>
					{i > 0 && segment.start - segments[i - 1].end - 1 > 0 && (
						<div className="code-separator-row">
							{"\u22EF"} {segment.start - segments[i - 1].end - 1} lines hidden
						</div>
					)}
					<CodeSegment allLines={allLines} segment={segment} />
				</div>
			))}
			{last && last.end < allLines.length && (
				<button
					className="code-expand-row code-expand-below"
					onClick={onExpandBelow}
					type="button"
				>
					{"\u2193"} Expand {Math.min(EXPAND_STEP, allLines.length - last.end)}{" "}
					lines
				</button>
			)}
		</div>
	);
}
