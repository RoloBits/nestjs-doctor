#!/usr/bin/env node
// Replays a recorded nestjs-doctor scan and the agent session that fixes it,
// for the landing page recording. Messages, counts and scores are real output
// from scanning the bad-practices fixture.
//
//   node animate-scan.mjs scan     the report; the clean run on the second call
//   node animate-scan.mjs agent    the agent session that applies the fixes

import { existsSync, writeFileSync } from "node:fs";

const COLS = 76;
const W = 53;
const BAR = 50;
const BOX = 58;
const FLAG = "/tmp/nd-demo-scanned";

const D = "\x1b[2m";
const B = "\x1b[1m";
const N = "\x1b[22m";
const RED = "\x1b[31m";
const YEL = "\x1b[33m";
const GRN = "\x1b[32m";
const DEF = "\x1b[39m";
const CLAY = "\x1b[38;2;217;119;87m";

const out = (s) => process.stdout.write(s);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const vis = (s) => [...s.replace(/\x1b\[[0-9;:]*m/g, "")].length;
const pad = (s, n) => s + " ".repeat(Math.max(0, n - vis(s)));
const easeOut = (t) => 1 - (1 - t) ** 3;

const FINDINGS = [
	{
		icon: "✗",
		color: RED,
		msg: "Possible hardcoded Secret key detected.",
		count: 4,
	},
	{
		icon: "✗",
		color: RED,
		msg: "Controller injects repository 'UsersRepository' directly. Use a service layer instead.",
	},
	{
		icon: "⚠",
		color: YEL,
		msg: "Constructor parameter 'usersService' should be readonly.",
		count: 3,
	},
	{
		icon: "⚠",
		color: YEL,
		msg: "Endpoint 'findAll' has no @UseGuards() at class or method level.",
		count: 2,
	},
	{
		icon: "⚠",
		color: YEL,
		msg: "Provider 'ConfigService' is never injected by any other provider or controller.",
	},
];

const MASCOT = [
	"  ████████████  ",
	"  ██ ██████ ██  ",
	"████████████████",
	"  ████████████  ",
	"    █ █  █ █    ",
];

const BANNER_NOTES = [
	"",
	`${B}Claude Code${N} ${D}v2.1.238${N}`,
	`${D}Opus 5 (1M context)${N}`,
	`${D}~/projects/acme-api${N}`,
	"",
];

const PROMPT_TEXT = "Fix nestjs-doctor errors and warnings";
const SPINNER = ["✻", "✽", "✢", "✳", "∗", "✢"];

const DIFF = [
	`  ${CLAY}⏺${DEF} Update(${B}src/users/users.controller.ts${N})`,
	`    ${D}⎿${N}  1 addition, 1 removal`,
	`       ${RED}- constructor(private usersRepo: UsersRepository) {}${DEF}`,
	`       ${GRN}+ constructor(private readonly users: UsersService) {}${DEF}`,
];

const wrapPlain = (text, width) => {
	const lines = [];
	let cur = "";
	for (const word of text.split(" ")) {
		if (cur && cur.length + 1 + word.length > width) {
			lines.push(cur);
			cur = word;
		} else {
			cur = cur ? `${cur} ${word}` : word;
		}
	}
	if (cur) {
		lines.push(cur);
	}
	return lines;
};

const row = (content) => `  ${D}│${N} ${pad(content, W - 1)}${D}│${N}`;

const scoreBand = (score) => {
	if (score >= 90) {
		return { color: GRN, eyes: "◠ ◠ ◠", label: "Excellent" };
	}
	if (score >= 75) {
		return { color: GRN, eyes: "◠ ◠ ◠", label: "Good" };
	}
	if (score >= 50) {
		return { color: YEL, eyes: "• • •", label: "Fair" };
	}
	return { color: RED, eyes: "x x x", label: "Poor" };
};

const card = (score, clean) => {
	const { color, eyes, label } = scoreBand(score);
	const stars = Math.max(1, Math.round(score / 20));
	const filled = Math.round((score / 100) * BAR);
	const bar = `${color}${"█".repeat(filled)}${DEF}${D}${"░".repeat(BAR - filled)}${N}  `;
	const summary = clean
		? `${GRN}No issues found!${DEF}  ${D}6 files scanned${N}  ${D}in 15ms${N}`
		: `${RED}✗ 5 errors${DEF}  ${YEL}⚠ 6 warnings${DEF}  ${D}across 3/5 files${N}  ${D}in 21ms${N}`;
	return [
		`  ${D}┌${"─".repeat(W)}┐${N}`,
		row(`${color}┌───────┐${DEF}`),
		row(`${color}│ ${eyes} │${DEF}  NestJS Doctor`),
		row(`${color}│ ╰───╯ │${DEF}`),
		row(`${color}└───────┘${DEF}`),
		row(""),
		row(
			`${color}${score}${DEF} / 100  ${color}${"★".repeat(stars)}${"☆".repeat(5 - stars)}${DEF}  ${color}${label}${DEF}`
		),
		row(""),
		row(bar),
		row(""),
		row(summary),
		`  ${D}└${"─".repeat(W)}┘${N}`,
	];
};

const findingLines = (finding) => {
	const chunks = wrapPlain(finding.msg, COLS - 4);
	const tail = finding.count ? ` (${finding.count})` : "";
	return chunks.map((chunk, index) =>
		index === 0
			? `  ${finding.color}${finding.icon}${DEF} ${chunk}${chunks.length === 1 ? tail : ""}`
			: `    ${chunk}${index === chunks.length - 1 ? tail : ""}`
	);
};

const revealScore = async (target, clean) => {
	const frames = 18;
	out(card(0, clean).join("\n"));
	for (let i = 1; i <= frames; i++) {
		const score = Math.round(easeOut(i / frames) * target);
		out("\r\x1b[11A");
		out(
			card(score, clean)
				.map((line) => `\x1b[K${line}`)
				.join("\n")
		);
		await sleep(26);
	}
};

const PROJECT = `${D}  Project: acme-api | NestJS 10.0.0 | 1 modules${N}`;

const scan = async () => {
	const clean = existsSync(FLAG);
	writeFileSync(FLAG, "1");
	out("\x1b[?25l");
	await sleep(240);
	await revealScore(clean ? 100 : 35, clean);
	await sleep(240);
	out(`\n\n${PROJECT}\n`);
	if (clean) {
		await sleep(600);
		out("\x1b[?25h\n");
		return;
	}
	out("\n");
	for (const finding of FINDINGS) {
		out(`${findingLines(finding).join("\n")}\n`);
		await sleep(130 + Math.random() * 120);
	}
	await sleep(600);
	out("\x1b[?25h\n");
};

const agent = async () => {
	out("\x1b[?25l\n");

	for (const [index, art] of MASCOT.entries()) {
		out(`  ${CLAY}${art}${DEF}  ${BANNER_NOTES[index]}\n`);
		await sleep(60);
	}
	await sleep(620);

	const box = (typed, caret) => [
		`  ${D}╭${"─".repeat(BOX)}╮${N}`,
		`  ${D}│${N} ${D}>${N} ${pad(`${typed}${caret}`, BOX - 4)} ${D}│${N}`,
		`  ${D}╰${"─".repeat(BOX)}╯${N}`,
	];

	out(`\n${box("", "█").join("\n")}`);
	await sleep(420);
	for (let i = 1; i <= PROMPT_TEXT.length; i++) {
		const caret = i < PROMPT_TEXT.length ? "█" : "";
		out("\r\x1b[2A");
		out(
			box(PROMPT_TEXT.slice(0, i), caret)
				.map((l) => `\x1b[K${l}`)
				.join("\n")
		);
		await sleep(34 + Math.random() * 40);
	}
	await sleep(520);

	// Submit: the box collapses into the sent prompt.
	out(`\r\x1b[2A\x1b[K  ${D}>${N} ${PROMPT_TEXT}\x1b[J\n`);
	await sleep(420);

	out("\n");
	const ticks = 13;
	for (let i = 0; i < ticks; i++) {
		const glyph = SPINNER[i % SPINNER.length];
		const seconds = 2 + Math.floor(i / 2);
		out(
			`\r\x1b[K  ${CLAY}${glyph}${DEF} Fixing issues… ${D}(${seconds}s · ↑ 1.2k tokens · esc to interrupt)${N}`
		);
		await sleep(200);
	}

	out("\r\x1b[K");
	for (const line of DIFF) {
		out(`${line}\n`);
		await sleep(260);
	}
	await sleep(500);
	out(`\n  ${GRN}✅ All issues fixed${DEF}\n`);
	await sleep(900);
	out("\x1b[?25h\n");
};

if (process.argv[2] === "agent") {
	await agent();
} else {
	await scan();
}
