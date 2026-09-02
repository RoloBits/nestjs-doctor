// Renders the landing demo as a looping animated SVG for the README:
//   bun demo/render-svg.ts   (from packages/website)  ->  public/demo.svg
// The chrome is drawn in SVG, the terminal text is real text, and every line is
// timed by CSS keyframes from the same timeline the landing page plays.

import { writeFileSync } from "node:fs";
import {
	AGENT_COMMAND,
	AT,
	BANNER_LINE_MS,
	CHAR_MS,
	CLEAN_SCORE,
	COMMAND,
	countUp,
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
	SPINNER,
	SPINNER_TICK_MS,
	TOTAL_MS,
} from "@/components/landing/demo/script";
import {
	getNestBirds,
	PERFECT_SCORE,
	palette,
	SCORE_BAR_WIDTH,
	scoreColor,
	scoreTier,
} from "@/lib/tui-theme";

const W = 760;
const H = 560;
const MENU_H = 24;
const STAGE_PAD = 24;
const BAR_H = 40;
const WIN = { x: STAGE_PAD, y: MENU_H + STAGE_PAD, w: W - STAGE_PAD * 2 };
const BODY = {
	x: WIN.x,
	y: WIN.y + BAR_H,
	w: WIN.w,
	h: H - STAGE_PAD - WIN.y - BAR_H,
};
const PAD_X = 16;
const PAD_Y = 12;
const FS = 13;
const LH = 19.5;
const TIGHT = 16.25;
const CW = 8;
const COLS = Math.floor((BODY.w - PAD_X * 2) / CW);
const BASELINE = 14;
const BG = "#0a0a0a";
const CLAY = "#d97757";
const DUR = `${TOTAL_MS}ms`;
const SCORE_COUNT_MS = 470;
const COUNT_FRAME_MS = 60;

interface Seg {
	bold?: boolean;
	fill?: string;
	text: string;
}
type Win = [number, number];

const css: string[] = [];
const reveals: { at: number; bottom: number }[] = [];
let serial = 0;

const esc = (s: string) =>
	s
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");

const pct = (ms: number) =>
	`${((Math.min(ms, TOTAL_MS) / TOTAL_MS) * 100).toFixed(3)}%`;

const cols = (text: string) =>
	[...text].reduce((n, ch) => n + (ch === "✅" ? 2 : 1), 0);

const shownAtEnd = (wins: Win[]) =>
	wins.some(([a, b]) => END_MS >= a && END_MS < b);

/** An id attribute whose CSS shows the element only inside `wins`. */
const vis = (wins: Win[], extraAnimation = ""): string => {
	const always =
		wins.length === 1 &&
		wins[0][0] === 0 &&
		wins[0][1] === Number.POSITIVE_INFINITY;
	if (always && !extraAnimation) {
		return "";
	}
	const id = `v${serial++}`;
	const frames = [`0%{visibility:${wins[0][0] === 0 ? "visible" : "hidden"}}`];
	for (const [a, b] of wins) {
		if (a > 0) {
			frames.push(`${pct(a)}{visibility:visible}`);
		}
		if (b < TOTAL_MS) {
			frames.push(`${pct(b)}{visibility:hidden}`);
		}
	}
	const animations = always
		? extraAnimation
		: `${id} ${DUR} steps(1,end) infinite${extraAnimation ? `,${extraAnimation}` : ""}`;
	if (!always) {
		css.push(`@keyframes ${id}{${frames.join("")}}`);
	}
	css.push(
		`#${id}{visibility:${shownAtEnd(wins) ? "visible" : "hidden"};animation:${animations}}`
	);
	return ` id="${id}"`;
};

const text = (
	x: number,
	yTop: number,
	segs: Seg[],
	wins: Win[],
	lineHeight = LH,
	blocks = false
): string => {
	const total = segs.reduce((n, s) => n + cols(s.text), 0);
	const spans = segs
		.map((s) => {
			const attrs = `${s.fill ? ` fill="${s.fill}"` : ""}${s.bold ? ' font-weight="bold"' : ""}`;
			return `<tspan${attrs}>${esc(s.text)}</tspan>`;
		})
		.join("");
	reveals.push({ at: wins[0][0], bottom: yTop + lineHeight });
	return `<text${vis(wins)} x="${x}" y="${yTop + BASELINE}" textLength="${total * CW}" lengthAdjust="${blocks ? "spacingAndGlyphs" : "spacing"}">${spans}</text>`;
};

const dim = (s: string): Seg => ({ text: s, fill: palette.dim });

/** A prompt line whose command is typed by sliding a cover off the text. */
const prompt = (
	yTop: number,
	command: string,
	shownAt: number,
	start: number,
	runAt: number
): string => {
	const line = text(
		0,
		yTop,
		[dim("$ "), { text: command }],
		[[shownAt, Number.POSITIVE_INFINITY]]
	);
	const id = `t${serial++}`;
	const width = command.length * CW;
	const end = start + command.length * CHAR_MS;
	css.push(
		`@keyframes ${id}{0%,${pct(start)}{transform:translateX(0);animation-timing-function:steps(${command.length},end)}${pct(end)},100%{transform:translateX(${width}px)}}`
	);
	css.push(
		`#${id}{transform:translateX(${width}px);animation:${id} ${DUR} linear infinite}`
	);
	const cursor = `<rect${vis([[shownAt, runAt]], "blink 1s steps(1,end) infinite")} x="0" y="3" width="${CW}" height="${LH - 6}" fill="${palette.text}"/>`;
	return `${line}<g transform="translate(${2 * CW},${yTop})"><g id="${id}"><rect x="0" y="0" width="${BODY.w}" height="${LH}" fill="${BG}"/>${cursor}</g></g>`;
};

const idlePrompt = (yTop: number, start: number): string =>
	`${text(0, yTop, [dim("$ ")], [[start, Number.POSITIVE_INFINITY]])}<g transform="translate(${2 * CW},${yTop})"><rect${vis([[start, Number.POSITIVE_INFINITY]], "blink 1s steps(1,end) infinite")} x="0" y="3" width="${CW}" height="${LH - 6}" fill="${palette.text}"/></g>`;

const wrap = (message: string, width: number): string[] => {
	const lines: string[] = [];
	let line = "";
	for (const word of message.split(" ")) {
		if (line && line.length + 1 + word.length > width) {
			lines.push(line);
			line = word;
		} else {
			line = line ? `${line} ${word}` : word;
		}
	}
	lines.push(line);
	return lines;
};

const CARD_PAD = 12;
const CARD_MARGIN = 8;
const FACE_ROWS = 4;
const FACE_H = FACE_ROWS * TIGHT;
const CARD_GAP = 8;
const CARD_H = CARD_PAD * 2 + FACE_H + CARD_GAP * 3 + LH * 3;

/** The console reporter's score card, counting up from zero. */
const card = (
	yTop: number,
	start: number,
	target: number,
	clean: boolean
): { svg: string; height: number } => {
	const top = yTop + CARD_MARGIN;
	const status: Seg[] = clean
		? [
				{ text: "No issues found!", fill: palette.success },
				dim("  6 files scanned  in 15ms"),
			]
		: [
				{ text: "✗ 5 errors", fill: palette.error },
				{ text: "  " },
				{ text: "⚠ 6 warnings", fill: palette.warning },
				dim("  across 3/5 files  in 21ms"),
			];
	const widest = Math.max(
		status.reduce((n, s) => n + cols(s.text), 0) * CW,
		SCORE_BAR_WIDTH * CW,
		9 * CW + 12 + "NestJS Doctor".length * CW
	);
	const parts: string[] = [];
	parts.push(
		`<rect${vis([[start, Number.POSITIVE_INFINITY]])} x="0.5" y="${top + 0.5}" width="${widest + CARD_PAD * 2}" height="${CARD_H}" fill="none" stroke="rgba(255,255,255,0.15)"/>`
	);
	const faceTop = top + CARD_PAD;
	parts.push(
		text(
			9 * CW + 12 + CARD_PAD,
			faceTop + FACE_H / 2 - LH / 2,
			[{ text: "NestJS Doctor", fill: palette.bright }],
			[[start, Number.POSITIVE_INFINITY]]
		)
	);
	const scoreTop = faceTop + FACE_H + CARD_GAP;
	const barTop = scoreTop + LH + CARD_GAP;
	const statusTop = barTop + LH + CARD_GAP;
	parts.push(
		text(CARD_PAD, statusTop, status, [[start, Number.POSITIVE_INFINITY]])
	);

	const ticks = [
		...Array.from(
			{ length: Math.ceil(SCORE_COUNT_MS / COUNT_FRAME_MS) },
			(_, i) => i * COUNT_FRAME_MS
		),
		SCORE_COUNT_MS,
	];
	const frames: { at: number; score: number }[] = [];
	for (const tick of ticks) {
		const score = countUp(start + tick, start, target);
		if (frames.length === 0 || frames.at(-1)?.score !== score) {
			frames.push({ at: start + tick, score });
		}
	}
	frames.forEach(({ at, score }, i) => {
		const until = frames[i + 1]?.at ?? Number.POSITIVE_INFINITY;
		const win: Win[] = [[at, until]];
		const color = scoreColor(score);
		const tier = scoreTier(score);
		const birds = getNestBirds(score);
		const face = [
			"┌───────┐",
			`│ ${birds[0]} │`,
			`│ ${birds[1]} │`,
			"└───────┘",
		];
		const filled = Math.round((score / PERFECT_SCORE) * SCORE_BAR_WIDTH);
		let group = "";
		face.forEach((row, r) => {
			group += text(
				CARD_PAD,
				faceTop + r * TIGHT,
				[{ text: row, fill: color }],
				win,
				TIGHT
			);
		});
		group += text(
			CARD_PAD,
			scoreTop,
			[
				{ text: String(score), fill: color, bold: true },
				dim(` / ${PERFECT_SCORE}  `),
				{ text: `${tier.stars}  ${tier.label}`, fill: color },
			],
			win
		);
		group += text(
			CARD_PAD,
			barTop,
			[
				{ text: "█".repeat(filled), fill: color },
				dim("░".repeat(SCORE_BAR_WIDTH - filled)),
			],
			win,
			LH,
			true
		);
		parts.push(group);
	});
	reveals.push({ at: start, bottom: top + CARD_H });
	return { svg: parts.join(""), height: CARD_H + CARD_MARGIN * 2 };
};

const findings = (yTop: number): { svg: string; height: number } => {
	const parts: string[] = [];
	let y = yTop;
	FINDINGS.forEach((finding, i) => {
		const isError = finding.severity === "error";
		const at = AT.findings + i * FINDING_GAP_MS;
		const message = finding.count
			? `${finding.message} (${finding.count})`
			: finding.message;
		const lines = wrap(message, COLS - 3);
		lines.forEach((line, r) => {
			const segs: Seg[] =
				r === 0
					? [
							{
								text: isError ? "✗" : "⚠",
								fill: isError ? palette.error : palette.warning,
							},
							{ text: " " },
						]
					: [{ text: "  " }];
			const countSuffix = finding.count ? ` (${finding.count})` : "";
			if (r === lines.length - 1 && countSuffix && line.endsWith(countSuffix)) {
				segs.push({ text: line.slice(0, -countSuffix.length) });
				segs.push(dim(countSuffix));
			} else {
				segs.push({ text: line });
			}
			parts.push(text(CW, y, segs, [[at, Number.POSITIVE_INFINITY]]));
			y += LH;
		});
	});
	return { svg: parts.join(""), height: y - yTop };
};

const banner = (yTop: number): { svg: string; height: number } => {
	const top = yTop + CARD_MARGIN;
	const rows: Seg[][] = [
		[{ text: " " }],
		[
			{ text: "Claude Code", fill: palette.bright, bold: true },
			dim(" v2.1.238"),
		],
		[dim("Opus 5 (1M context)")],
		[dim("~/projects/acme-api")],
		[{ text: " " }],
	];
	const parts: string[] = [];
	const textX = CW + MASCOT[0].length * CW + 12;
	MASCOT.forEach((row, r) => {
		const at = AT.banner + r * BANNER_LINE_MS;
		const win: Win[] = [[at, Number.POSITIVE_INFINITY]];
		parts.push(
			`<g${vis(win)} fill="${CLAY}">${mascotRow(row, top + r * TIGHT)}</g>`
		);
		parts.push(text(textX, top + r * TIGHT, rows[r], win, TIGHT));
	});
	return {
		svg: parts.join(""),
		height: MASCOT.length * TIGHT + CARD_MARGIN * 2,
	};
};

/** One mascot row as merged rects, so it needs no block glyphs. */
const mascotRow = (row: string, y: number): string => {
	const rects: string[] = [];
	let start = -1;
	for (let i = 0; i <= row.length; i++) {
		const on = row[i] === "\u2588";
		if (on && start < 0) {
			start = i;
		} else if (!on && start >= 0) {
			const x = CW + start * CW;
			rects.push(
				`<rect x="${x}" y="${y}" width="${(i - start) * CW}" height="${TIGHT}"/>`
			);
			start = -1;
		}
	}
	return rects.join("");
};

const BOX_H = LH + 10;

const agentSession = (yTop: number): { svg: string; height: number } => {
	const parts: string[] = [];
	let y = yTop;

	const boxWidth = (2 + PROMPT_TEXT.length) * CW + 16;
	parts.push(
		`<rect${vis([[AT.box, AT.sent]])} x="0.5" y="${y + 0.5}" width="${boxWidth}" height="${BOX_H}" rx="4" fill="none" stroke="rgba(255,255,255,0.25)"/>`
	);
	parts.push(
		text(8, y + 5, [dim("> "), { text: PROMPT_TEXT }], [[AT.box, AT.sent]])
	);
	const typingEnd = AT.promptTyping + PROMPT_TEXT.length * PROMPT_CHAR_MS;
	const id = `t${serial++}`;
	const width = PROMPT_TEXT.length * CW;
	css.push(
		`@keyframes ${id}{0%,${pct(AT.promptTyping)}{transform:translateX(0);animation-timing-function:steps(${PROMPT_TEXT.length},end)}${pct(typingEnd)},100%{transform:translateX(${width}px)}}`
	);
	css.push(
		`#${id}{transform:translateX(${width}px);animation:${id} ${DUR} linear infinite}`
	);
	parts.push(
		`<g${vis([[AT.box, AT.sent]])} transform="translate(${8 + 2 * CW},${y + 5})"><g id="${id}"><rect x="0" y="0" width="${width + CW}" height="${LH}" fill="${BG}"/><rect x="0" y="3" width="${CW}" height="${LH - 6}" fill="${palette.text}"/></g></g>`
	);
	parts.push(
		text(
			CW,
			y + 5,
			[dim("> "), { text: PROMPT_TEXT }],
			[[AT.sent, Number.POSITIVE_INFINITY]]
		)
	);
	y += BOX_H + CARD_GAP;

	const ticks = Math.round((AT.diff - AT.spinner) / SPINNER_TICK_MS);
	for (let i = 0; i < ticks; i++) {
		const at = AT.spinner + i * SPINNER_TICK_MS;
		parts.push(
			text(
				CW,
				y,
				[
					{ text: SPINNER[i % SPINNER.length], fill: CLAY },
					{ text: " Fixing issues… " },
					dim(`(${2 + Math.floor(i / 2)}s · ↑ 1.2k tokens · esc to interrupt)`),
				],
				[[at, Math.min(at + SPINNER_TICK_MS, AT.diff)]]
			)
		);
	}
	const diffRows: Seg[][] = [
		[
			{ text: "⏺", fill: CLAY },
			{ text: " Update(" },
			{ text: DIFF.file, bold: true },
			{ text: ")" },
		],
		[dim(`  ⎿  ${DIFF.stat}`)],
		[{ text: `     ${DIFF.removed}`, fill: palette.error }],
		[{ text: `     ${DIFF.added}`, fill: palette.success }],
	];
	for (let r = 0; r < DIFF_LINES; r++) {
		parts.push(
			text(CW, y + r * LH, diffRows[r], [
				[AT.diff + r * DIFF_LINE_MS, Number.POSITIVE_INFINITY],
			])
		);
	}
	y += DIFF_LINES * LH + CARD_GAP;

	parts.push(
		text(
			CW,
			y,
			[{ text: "✅ All issues fixed", fill: palette.success }],
			[[AT.done, Number.POSITIVE_INFINITY]]
		)
	);
	y += LH;
	return { svg: parts.join(""), height: y - yTop };
};

const content = (): string => {
	const parts: string[] = [];
	let y = 0;
	const MT3 = 12;

	parts.push(prompt(y, COMMAND, 0, AT.type1, AT.run1));
	y += LH;
	const card1 = card(y, AT.scan1, DIRTY_SCORE, false);
	parts.push(card1.svg);
	y += card1.height;
	parts.push(
		text(
			0,
			y,
			[dim(`  ${PROJECT_LINE}`)],
			[[AT.project1, Number.POSITIVE_INFINITY]]
		)
	);
	y += LH + CARD_GAP;
	const list = findings(y);
	parts.push(list.svg);
	y += list.height + MT3;
	parts.push(prompt(y, AGENT_COMMAND, AT.pause1, AT.type2, AT.banner));
	y += LH;
	const head = banner(y);
	parts.push(head.svg);
	y += head.height;
	const session = agentSession(y);
	parts.push(session.svg);
	y += session.height + MT3;
	parts.push(prompt(y, COMMAND, AT.pause2, AT.type3, AT.run3));
	y += LH;
	const card2 = card(y, AT.scan2, CLEAN_SCORE, true);
	parts.push(card2.svg);
	y += card2.height;
	parts.push(
		text(
			0,
			y,
			[dim(`  ${PROJECT_LINE}`)],
			[[AT.project2, Number.POSITIVE_INFINITY]]
		)
	);
	y += LH + MT3;
	parts.push(idlePrompt(y, AT.hold));
	return parts.join("");
};

/** Keeps the newest line in view, the way the landing page follows its output. */
const scrollCss = (): string => {
	const events = [...reveals].sort((a, b) => a.at - b.at);
	const frames: string[] = ["0%{transform:translateY(0)}"];
	let bottom = 0;
	let offset = 0;
	let endOffset = 0;
	for (const event of events) {
		bottom = Math.max(bottom, event.bottom);
		const next = Math.max(0, bottom + PAD_Y * 2 - BODY.h);
		if (next !== offset) {
			offset = next;
			frames.push(`${pct(event.at)}{transform:translateY(-${offset}px)}`);
		}
		if (event.at <= END_MS) {
			endOffset = offset;
		}
	}
	css.push(`@keyframes scroll{${frames.join("")}}`);
	css.push(
		`#scroll{transform:translateY(-${endOffset}px);animation:scroll ${DUR} steps(1,end) infinite}`
	);
	return "";
};

const wallpaper = (): string => `
<svg x="0" y="0" width="${W}" height="${H}" viewBox="0 0 1000 600" preserveAspectRatio="xMidYMid slice">
<defs><linearGradient id="sky" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#c9e4f6"/><stop offset="1" stop-color="#e6f0f7"/></linearGradient></defs>
<rect width="1000" height="600" fill="url(#sky)"/>
<path d="M0,180 Q150,120 350,160 T700,140 T1000,170 V600 H0 Z" fill="#a8d4e6"/>
<path d="M0,220 Q200,170 400,210 T750,190 T1000,220 V600 H0 Z" fill="#8ec4d6"/>
<path d="M0,280 Q180,230 380,260 T720,240 T1000,270 V600 H0 Z" fill="#7cb5aa"/>
<path d="M0,330 Q220,290 420,320 T780,300 T1000,330 V600 H0 Z" fill="#9cc98e"/>
<path d="M0,380 Q160,340 360,370 T700,350 T1000,380 V600 H0 Z" fill="#e8d17d"/>
<path d="M0,430 Q200,400 400,420 T750,400 T1000,430 V600 H0 Z" fill="#df9255"/>
<path d="M0,480 Q180,450 380,470 T720,455 T1000,480 V600 H0 Z" fill="#d97046"/>
<path d="M0,530 Q220,500 420,520 T780,505 T1000,530 V600 H0 Z" fill="#c65d3b"/>
</svg>
<rect width="${W}" height="${H}" fill="rgba(0,0,0,0.3)"/>`;

const APPLE =
	"M17.05 12.54c-.02-2.4 1.96-3.55 2.05-3.61-1.12-1.63-2.86-1.86-3.48-1.89-1.48-.15-2.89.87-3.64.87-.75 0-1.91-.85-3.14-.83-1.61.02-3.1.94-3.93 2.38-1.68 2.91-.43 7.21 1.2 9.57.8 1.15 1.75 2.45 3 2.4 1.21-.05 1.66-.78 3.12-.78 1.46 0 1.87.78 3.14.75 1.3-.02 2.12-1.17 2.91-2.33.92-1.34 1.3-2.64 1.32-2.7-.03-.01-2.53-.97-2.55-3.85M14.7 5.4c.66-.8 1.11-1.92.99-3.03-.95.04-2.11.63-2.79 1.43-.61.71-1.15 1.85-1 2.94 1.06.08 2.14-.54 2.8-1.34";

const menuBar = (): string => {
	const items = [
		{ text: "nestjs-doctor", bold: true, fill: "#ffffff" },
		{ text: "Demo" },
		{ text: "Docs" },
		{ text: "GitHub" },
	];
	let x = 16 + 14 + 16;
	const spans = items
		.map((item) => {
			const svg = `<text x="${x}" y="16" font-size="11"${item.bold ? ' font-weight="bold"' : ""} fill="${item.fill ?? "rgba(255,255,255,0.8)"}">${item.text}</text>`;
			x += item.text.length * 6.6 + 16;
			return svg;
		})
		.join("");
	return `<rect width="${W}" height="${MENU_H}" fill="rgba(0,0,0,0.4)"/>
<g transform="translate(16,5) scale(0.583)"><path d="${APPLE}" fill="rgba(255,255,255,0.9)"/></g>
${spans}
<text x="${W - 16}" y="16" font-size="11" fill="rgba(255,255,255,0.8)" text-anchor="end">Wed Sep 2   9:41 AM</text>`;
};

const windowChrome = (body: string): string => `
<defs>
<clipPath id="win"><rect x="${WIN.x}" y="${WIN.y}" width="${WIN.w}" height="${BAR_H + BODY.h}" rx="10"/></clipPath>
<clipPath id="body"><rect x="${BODY.x}" y="${BODY.y}" width="${BODY.w}" height="${BODY.h}"/></clipPath>
<linearGradient id="bar" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#3a3a3c"/><stop offset="1" stop-color="#2a2a2c"/></linearGradient>
<filter id="shadow" x="-10%" y="-10%" width="120%" height="130%"><feDropShadow dx="0" dy="25" stdDeviation="20" flood-color="#000" flood-opacity="0.35"/></filter>
</defs>
<rect x="${WIN.x}" y="${WIN.y}" width="${WIN.w}" height="${BAR_H + BODY.h}" rx="10" fill="#000" filter="url(#shadow)"/>
<rect x="${WIN.x}" y="${WIN.y}" width="${WIN.w}" height="${BAR_H + BODY.h}" rx="10" fill="${BG}"/>
<g clip-path="url(#win)">
<rect x="${WIN.x}" y="${WIN.y}" width="${WIN.w}" height="${BAR_H}" fill="url(#bar)"/>
<line x1="${WIN.x}" x2="${WIN.x + WIN.w}" y1="${BODY.y + 0.5}" y2="${BODY.y + 0.5}" stroke="rgba(255,255,255,0.1)"/>
<circle cx="${WIN.x + 22}" cy="${WIN.y + BAR_H / 2}" r="6" fill="#FF5F57"/>
<circle cx="${WIN.x + 42}" cy="${WIN.y + BAR_H / 2}" r="6" fill="#FFBD2E"/>
<circle cx="${WIN.x + 62}" cy="${WIN.y + BAR_H / 2}" r="6" fill="#28CA41"/>
<text x="${WIN.x + WIN.w / 2}" y="${WIN.y + BAR_H / 2 + 4}" font-size="12" fill="rgba(255,255,255,0.7)" text-anchor="middle">Terminal — nestjs-doctor</text>
<g clip-path="url(#body)"><g transform="translate(${BODY.x + PAD_X},${BODY.y + PAD_Y})"><g id="scroll">${body}</g></g></g>
</g>
<rect x="${WIN.x + 0.5}" y="${WIN.y + 0.5}" width="${WIN.w - 1}" height="${BAR_H + BODY.h - 1}" rx="10" fill="none" stroke="rgba(255,255,255,0.1)"/>`;

const body = content();
scrollCss();
css.push("@keyframes blink{0%{opacity:1}50%{opacity:0}}");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xml:space="preserve" role="img" aria-labelledby="title">
<title id="title">nestjs-doctor scores a project ${DIRTY_SCORE} out of ${PERFECT_SCORE}, an agent fixes the findings, and a rescan scores ${CLEAN_SCORE}</title>
<style>
svg{font-family:ui-monospace,"SF Mono",Menlo,Consolas,"DejaVu Sans Mono","Liberation Mono",monospace;font-size:${FS}px;white-space:pre}
text{fill:${palette.text}}
${css.join("\n")}
@media (prefers-reduced-motion:reduce){*{animation:none!important}}
</style>
${wallpaper()}
${menuBar()}
${windowChrome(body)}
</svg>
`;

const out = new URL("../public/demo.svg", import.meta.url);
writeFileSync(out, svg);
console.log(
	`wrote ${out.pathname} (${(svg.length / 1024).toFixed(1)} KB, loop ${TOTAL_MS}ms)`
);
