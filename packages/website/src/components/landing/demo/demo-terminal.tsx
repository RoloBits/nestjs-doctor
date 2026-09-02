"use client";

import { useEffect, useRef } from "react";
import { ScoreBar } from "@/components/score-bar";
import {
	getNestBirds,
	PERFECT_SCORE,
	palette,
	scoreColor,
	scoreTier,
} from "@/lib/tui-theme";
import {
	AGENT_COMMAND,
	AT,
	BANNER_LINE_MS,
	CHAR_MS,
	CLEAN_SCORE,
	COMMAND,
	countUp,
	cursorOn,
	DIFF,
	DIFF_LINE_MS,
	DIFF_LINES,
	DIRTY_SCORE,
	END_MS,
	FINDING_GAP_MS,
	FINDINGS,
	MASCOT,
	PROJECT_LINE,
	PROMPT_CHAR_MS,
	PROMPT_TEXT,
	revealed,
	SPINNER,
	SPINNER_TICK_MS,
	TOTAL_MS,
	typed,
} from "./script";
import { useDemoClock } from "./use-demo-clock";

const CLAY = "#d97757";
const LABEL =
	"A terminal recording: nestjs-doctor scores a project 35 out of 100, an agent fixes the findings, and a rescan scores 100";

const Dim = ({ children }: { children: string }) => (
	<span style={{ color: palette.dim }}>{children}</span>
);

/** `$ ` plus what has been typed so far; the cursor stays until the command runs. */
const PromptLine = ({
	command,
	runAt,
	start,
	t,
}: {
	command: string;
	runAt: number;
	start: number;
	t: number;
}) => {
	const text = typed(t, start, command);
	const typing = t >= start && text.length < command.length;
	const cursor = t < runAt && (typing || cursorOn(t));
	return (
		<div className="whitespace-pre-wrap">
			<Dim>$ </Dim>
			{text}
			{cursor ? "█" : null}
		</div>
	);
};

/** The console reporter's score card. */
const ScoreCard = ({ clean, score }: { clean: boolean; score: number }) => {
	const color = scoreColor(score);
	const tier = scoreTier(score);
	const birds = getNestBirds(score);
	return (
		<div className="my-2 flex w-fit flex-col gap-2 border border-white/15 px-3 py-2">
			<div className="flex items-center gap-3">
				<pre className="m-0 font-blocks leading-tight" style={{ color }}>
					{`┌───────┐\n│ ${birds[0]} │\n│ ${birds[1]} │\n└───────┘`}
				</pre>
				<span style={{ color: palette.bright }}>NestJS Doctor</span>
			</div>
			<div className="whitespace-pre-wrap">
				<span className="font-bold" style={{ color }}>
					{score}
				</span>
				<Dim>{` / ${PERFECT_SCORE}  `}</Dim>
				<span style={{ color }}>{`${tier.stars}  ${tier.label}`}</span>
			</div>
			<ScoreBar score={score} />
			{clean ? (
				<div className="whitespace-pre-wrap">
					<span style={{ color: palette.success }}>No issues found!</span>
					<Dim>{"  6 files scanned  in 15ms"}</Dim>
				</div>
			) : (
				<div className="whitespace-pre-wrap">
					<span style={{ color: palette.error }}>✗ 5 errors</span>
					{"  "}
					<span style={{ color: palette.warning }}>⚠ 6 warnings</span>
					<Dim>{"  across 3/5 files  in 21ms"}</Dim>
				</div>
			)}
		</div>
	);
};

const Findings = ({ count }: { count: number }) => (
	<div className="mt-2 flex flex-col">
		{FINDINGS.slice(0, count).map((finding) => {
			const isError = finding.severity === "error";
			return (
				<div className="flex gap-2 pl-2" key={finding.message}>
					<span style={{ color: isError ? palette.error : palette.warning }}>
						{isError ? "✗" : "⚠"}
					</span>
					<span>
						{finding.message}
						{finding.count ? <Dim>{` (${finding.count})`}</Dim> : null}
					</span>
				</div>
			);
		})}
	</div>
);

const BANNER = [
	<div key="top"> </div>,
	<div key="name">
		<span className="font-bold" style={{ color: palette.bright }}>
			Claude Code
		</span>
		<Dim> v2.1.238</Dim>
	</div>,
	<div key="model">
		<Dim>Opus 5 (1M context)</Dim>
	</div>,
	<div key="cwd">
		<Dim>~/projects/acme-api</Dim>
	</div>,
	<div key="bottom"> </div>,
];

const Banner = ({ rows }: { rows: number }) => (
	<div className="my-2 flex gap-3 pl-2 leading-tight">
		<pre className="m-0 font-blocks" style={{ color: CLAY }}>
			{MASCOT.slice(0, rows).join("\n")}
		</pre>
		<div className="flex flex-col whitespace-pre-wrap">
			{BANNER.slice(0, rows)}
		</div>
	</div>
);

const AgentSession = ({ t }: { t: number }) => {
	const spinnerTick = Math.floor((t - AT.spinner) / SPINNER_TICK_MS);
	const typingEnd = AT.promptTyping + PROMPT_TEXT.length * PROMPT_CHAR_MS;
	const diffRows = revealed(t, AT.diff, DIFF_LINES, DIFF_LINE_MS);
	return (
		<div className="flex flex-col gap-2">
			{t >= AT.box && t < AT.sent ? (
				<div className="flex gap-2 whitespace-pre-wrap rounded border border-white/25 px-2 py-1">
					<Dim>&gt;</Dim>
					<span>
						{typed(t, AT.promptTyping, PROMPT_TEXT, PROMPT_CHAR_MS)}
						{t < typingEnd ? "█" : null}
					</span>
				</div>
			) : null}
			{t >= AT.sent ? (
				<div className="whitespace-pre-wrap pl-2">
					<Dim>&gt; </Dim>
					{PROMPT_TEXT}
				</div>
			) : null}
			{t >= AT.spinner && t < AT.diff ? (
				<div className="whitespace-pre-wrap pl-2">
					<span style={{ color: CLAY }}>
						{SPINNER[spinnerTick % SPINNER.length]}
					</span>
					{" Fixing issues… "}
					<Dim>{`(${2 + Math.floor(spinnerTick / 2)}s · ↑ 1.2k tokens · esc to interrupt)`}</Dim>
				</div>
			) : null}
			{t >= AT.diff ? (
				<div className="flex flex-col whitespace-pre-wrap pl-2">
					<div className="flex gap-2">
						<span style={{ color: CLAY }}>⏺</span>
						<span>
							{"Update("}
							<span className="font-bold">{DIFF.file}</span>
							{")"}
						</span>
					</div>
					{diffRows >= 2 ? (
						<div>
							<Dim>{"  ⎿  "}</Dim>
							<Dim>{DIFF.stat}</Dim>
						</div>
					) : null}
					{diffRows >= 3 ? (
						<div style={{ color: palette.error }}>{`     ${DIFF.removed}`}</div>
					) : null}
					{diffRows >= 4 ? (
						<div style={{ color: palette.success }}>{`     ${DIFF.added}`}</div>
					) : null}
				</div>
			) : null}
			{t >= AT.done ? (
				<div className="pl-2" style={{ color: palette.success }}>
					✅ All issues fixed
				</div>
			) : null}
		</div>
	);
};

const Frame = ({ t }: { t: number }) => (
	<>
		<PromptLine command={COMMAND} runAt={AT.run1} start={AT.type1} t={t} />
		{t >= AT.scan1 ? (
			<ScoreCard clean={false} score={countUp(t, AT.scan1, DIRTY_SCORE)} />
		) : null}
		{t >= AT.project1 ? <Dim>{`  ${PROJECT_LINE}`}</Dim> : null}
		{t >= AT.findings ? (
			<Findings
				count={revealed(t, AT.findings, FINDINGS.length, FINDING_GAP_MS)}
			/>
		) : null}
		{t >= AT.pause1 ? (
			<div className="mt-3">
				<PromptLine
					command={AGENT_COMMAND}
					runAt={AT.banner}
					start={AT.type2}
					t={t}
				/>
			</div>
		) : null}
		{t >= AT.banner ? (
			<Banner rows={revealed(t, AT.banner, MASCOT.length, BANNER_LINE_MS)} />
		) : null}
		{t >= AT.box ? <AgentSession t={t} /> : null}
		{t >= AT.pause2 ? (
			<div className="mt-3">
				<PromptLine command={COMMAND} runAt={AT.run3} start={AT.type3} t={t} />
			</div>
		) : null}
		{t >= AT.scan2 ? (
			<ScoreCard clean score={countUp(t, AT.scan2, CLEAN_SCORE)} />
		) : null}
		{t >= AT.project2 ? <Dim>{`  ${PROJECT_LINE}`}</Dim> : null}
		{t >= AT.hold ? (
			<div className="mt-3 whitespace-pre-wrap">
				<Dim>$ </Dim>
				{cursorOn(t) ? "█" : null}
			</div>
		) : null}
	</>
);

/** The landing demo as live text: scan, fix, rescan, loop. The root is the
 * scroll container and follows new lines unless the reader scrolled up. */
export const DemoTerminal = () => {
	const { elapsed, ref } = useDemoClock(TOTAL_MS, END_MS);

	const lastHeight = useRef(0);

	useEffect(() => {
		const body = ref.current;
		if (!body) {
			return;
		}
		const grew = body.scrollHeight !== lastHeight.current;
		const wasAtBottom =
			body.scrollTop + body.clientHeight >= lastHeight.current - 2;
		if (elapsed < AT.type1 + CHAR_MS) {
			body.scrollTop = 0;
		} else if (grew && wasAtBottom) {
			body.scrollTop = body.scrollHeight;
		}
		lastHeight.current = body.scrollHeight;
	}, [elapsed, ref]);

	return (
		<div
			aria-label={LABEL}
			className="wrap-anywhere flex h-full flex-col overflow-auto px-3 py-3 text-[12px] leading-[1.5] sm:px-4 sm:text-[13px]"
			ref={ref}
			role="img"
			style={{ color: palette.text }}
		>
			<div aria-hidden="true" className="flex flex-col">
				<Frame t={elapsed} />
			</div>
		</div>
	);
};
