import { type BundledLanguage, codeToTokens, type ThemedToken } from "shiki";
import { CopyButton } from "./copy-button";
import { SplitPanes } from "./split-panes";

const THEME = "github-dark-default";
const TRAILING_NEWLINE = /\n$/;
const TONE_BG = { add: "bg-[#0f2f1a]", del: "bg-[#3d1418]", same: "" };

interface Op {
	/** Index into the after lines, when the op has a right side. */
	ai?: number;
	/** Index into the before lines, when the op has a left side. */
	bi?: number;
	kind: "same" | "del" | "add";
}

interface Cell {
	no: number;
	tokens: ThemedToken[];
}

interface Row {
	kind: "same" | "change";
	left?: Cell;
	right?: Cell;
}

/** Longest common subsequence over lines, walked back into an edit script. */
const lineOps = (before: string[], after: string[]): Op[] => {
	const table: number[][] = Array.from({ length: before.length + 1 }, () =>
		new Array(after.length + 1).fill(0)
	);
	for (let i = before.length - 1; i >= 0; i--) {
		for (let j = after.length - 1; j >= 0; j--) {
			table[i][j] =
				before[i] === after[j]
					? table[i + 1][j + 1] + 1
					: Math.max(table[i + 1][j], table[i][j + 1]);
		}
	}

	const ops: Op[] = [];
	let i = 0;
	let j = 0;
	while (i < before.length && j < after.length) {
		if (before[i] === after[j]) {
			ops.push({ ai: j, bi: i, kind: "same" });
			i++;
			j++;
		} else if (table[i + 1][j] >= table[i][j + 1]) {
			ops.push({ bi: i, kind: "del" });
			i++;
		} else {
			ops.push({ ai: j, kind: "add" });
			j++;
		}
	}
	while (i < before.length) {
		ops.push({ bi: i, kind: "del" });
		i++;
	}
	while (j < after.length) {
		ops.push({ ai: j, kind: "add" });
		j++;
	}
	return ops;
};

/** Pairs each run of removals with the run of additions beside it. */
const toRows = (
	ops: Op[],
	beforeTokens: ThemedToken[][],
	afterTokens: ThemedToken[][]
): Row[] => {
	const rows: Row[] = [];
	let cursor = 0;

	while (cursor < ops.length) {
		const op = ops[cursor];
		if (op.kind === "same") {
			const bi = op.bi ?? 0;
			const ai = op.ai ?? 0;
			rows.push({
				kind: "same",
				left: { no: bi + 1, tokens: beforeTokens[bi] ?? [] },
				right: { no: ai + 1, tokens: afterTokens[ai] ?? [] },
			});
			cursor++;
			continue;
		}

		const dels: Op[] = [];
		const adds: Op[] = [];
		while (cursor < ops.length && ops[cursor].kind === "del") {
			dels.push(ops[cursor]);
			cursor++;
		}
		while (cursor < ops.length && ops[cursor].kind === "add") {
			adds.push(ops[cursor]);
			cursor++;
		}

		for (let k = 0; k < Math.max(dels.length, adds.length); k++) {
			const delBi = dels[k]?.bi;
			const addAi = adds[k]?.ai;
			rows.push({
				kind: "change",
				left:
					delBi === undefined
						? undefined
						: { no: delBi + 1, tokens: beforeTokens[delBi] ?? [] },
				right:
					addAi === undefined
						? undefined
						: { no: addAi + 1, tokens: afterTokens[addAi] ?? [] },
			});
		}
	}
	return rows;
};

/** Every row carries at least one side, so the pair is unique. */
const rowKey = (row: Row) => `${row.left?.no ?? "x"}-${row.right?.no ?? "x"}`;

const Side = ({
	cell,
	tone,
}: {
	cell?: Cell;
	tone: "del" | "add" | "same";
}) => {
	if (!cell) {
		return <div className="h-[1.7em] w-full bg-white/[0.03]" />;
	}
	return (
		<div className={`flex h-[1.7em] w-full ${TONE_BG[tone]}`}>
			<span className="w-9 shrink-0 select-none pr-2 text-right text-white/25">
				{cell.no}
			</span>
			<span className="w-4 shrink-0 select-none text-white/40">
				{tone === "del" ? "-" : null}
				{tone === "add" ? "+" : null}
			</span>
			<code className="whitespace-pre pr-4">
				{cell.tokens.map((token) => (
					<span
						key={`${token.offset}-${token.content}`}
						style={{ color: token.color }}
					>
						{token.content}
					</span>
				))}
			</code>
		</div>
	);
};

export const SplitDiff = async ({
	before,
	after,
	lang = "ts",
	labels = ["Before", "After"],
}: {
	before: string;
	after: string;
	lang?: BundledLanguage;
	labels?: [string, string];
}) => {
	const beforeLines = before.replace(TRAILING_NEWLINE, "").split("\n");
	const afterLines = after.replace(TRAILING_NEWLINE, "").split("\n");

	const [beforeHl, afterHl] = await Promise.all([
		codeToTokens(beforeLines.join("\n"), { lang, theme: THEME }),
		codeToTokens(afterLines.join("\n"), { lang, theme: THEME }),
	]);

	const rows = toRows(
		lineOps(beforeLines, afterLines),
		beforeHl.tokens,
		afterHl.tokens
	);

	return (
		<div className="mt-4 mb-4 overflow-hidden rounded-lg border border-white/10 bg-[#0d0d0d] text-[13px] leading-[1.7]">
			<SplitPanes
				left={
					<div className="flex min-w-0 flex-col">
						<div className="truncate border-white/10 border-b px-3 py-2 font-medium text-[11px] text-white/60 uppercase tracking-wide">
							{labels[0]}
						</div>
						<div className="overflow-x-auto py-2">
							<div className="w-max min-w-full">
								{rows.map((row) => (
									<Side
										cell={row.left}
										key={`l-${rowKey(row)}`}
										tone={row.kind === "change" && row.left ? "del" : "same"}
									/>
								))}
							</div>
						</div>
					</div>
				}
				right={
					<div className="flex min-w-0 flex-col">
						<div className="flex items-center justify-between gap-2 border-white/10 border-b px-3 py-1.5 font-medium text-[11px] text-white/60 uppercase tracking-wide">
							<span className="truncate">{labels[1]}</span>
							<CopyButton label="Copy file" text={after} />
						</div>
						<div className="overflow-x-auto py-2">
							<div className="w-max min-w-full">
								{rows.map((row) => (
									<Side
										cell={row.right}
										key={`r-${rowKey(row)}`}
										tone={row.kind === "change" && row.right ? "add" : "same"}
									/>
								))}
							</div>
						</div>
					</div>
				}
			/>
		</div>
	);
};
