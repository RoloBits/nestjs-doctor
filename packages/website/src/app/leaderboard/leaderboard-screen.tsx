"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ScoreBar } from "@/components/score-bar";
import { track } from "@/lib/analytics";
import {
	isFocusInFrame,
	isInteractiveTarget,
	isTypingTarget,
} from "@/lib/keyboard";
import {
	getNestBirds,
	MENU_CLASS,
	MENU_LIST_CLASS,
	MENU_ROW_CLASS,
	PERFECT_SCORE,
	palette,
	scoreColor,
	scoreTier,
} from "@/lib/tui-theme";
import {
	type ResolvedLeaderboardEntry,
	SCANNED_AT,
	SCANNED_WITH,
	type TopRule,
} from "./leaderboard-entries";

const COMMAND = "npx -y nestjs-doctor@latest .";
const CONTRIBUTE_URL =
	"https://github.com/RoloBits/nestjs-doctor/edit/main/packages/website/src/app/leaderboard/leaderboard-entries.ts";
const SCORE_GOOD_THRESHOLD = 75;
const MARK_CLEAN_THRESHOLD = 90;
const COPIED_RESET_MS = 1600;
/** Rows the projects pane shows at once, the browser's answer to listCapacity. */
const LIST_CAPACITY = 10;

const SEVERITY_MARK: Record<TopRule["severity"], string> = {
	error: "✗",
	warning: "⚠",
	info: "●",
};

const severityColor = (severity: TopRule["severity"]): string => {
	if (severity === "error") {
		return palette.error;
	}
	if (severity === "warning") {
		return palette.warning;
	}
	return palette.info;
};

/** The row's mark: clean at 90, watch from 75, failing below. */
const rankMark = (score: number): string => {
	if (score >= MARK_CLEAN_THRESHOLD) {
		return "✓";
	}
	if (score >= SCORE_GOOD_THRESHOLD) {
		return "▲";
	}
	return "✗";
};

const nestTag = (entry: ResolvedLeaderboardEntry): string =>
	entry.upgradedTo
		? `Nest ${entry.nestMajor}, same on ${entry.upgradedTo}`
		: `Nest ${entry.nestMajor}`;

/** Nest version, star count, and whether the repo is an app or a starter. */
const originLine = (entry: ResolvedLeaderboardEntry): string => {
	const parts = [nestTag(entry)];
	if (entry.stars) {
		parts.push(`${entry.stars.toLocaleString("en-US")} stars`);
	}
	if (entry.kind) {
		parts.push(entry.kind);
	}
	return parts.join(" · ");
};

/** Keeps a scroll offset inside [0, total - visible]. Ported from tui/navigate.ts. */
const clampOffset = (offset: number, total: number, visible: number): number =>
	Math.max(0, Math.min(offset, Math.max(0, total - visible)));

/** Keeps the selection inside the visible window. Ported from tui/navigate.ts. */
const scrollWindow = (
	offset: number,
	selected: number,
	height: number
): number => {
	if (height <= 0) {
		return 0;
	}
	if (selected < offset) {
		return selected;
	}
	if (selected >= offset + height) {
		return selected - height + 1;
	}
	return offset;
};

const optionId = (index: number): string => `leaderboard-project-${index}`;

/** Pluralises like the TUI's countLabel. */
const countLabel = (count: number, singular: string): string =>
	`${count} ${singular}${count === 1 ? "" : "s"}`;

const shortRule = (rule: string): string =>
	rule.split("/").slice(1).join("/") || rule;

const FRAME_CLASS = "flex flex-col gap-4 px-4 py-4 text-[13px] leading-[1.5]";
const LIST_CLASS = "flex flex-col";
const LISTBOX_CLASS =
	"flex flex-col focus-visible:outline-2 focus-visible:outline-nest-red focus-visible:outline-offset-2";
const PANEL_LABEL_CLASS = "font-bold text-[11px] uppercase tracking-[0.08em]";
const ROW_CLASS =
	"flex w-full items-center gap-3 py-0.5 pr-2 text-left transition-colors";

const Separator = () => (
	<span className="whitespace-pre" style={{ color: palette.dim }}>
		{"  ·  "}
	</span>
);

interface MenuItem {
	copy?: string;
	external?: boolean;
	hint: string;
	href?: string;
	internal?: boolean;
	label: string;
}

const buildMenuItems = (entry: ResolvedLeaderboardEntry): MenuItem[] => [
	{ label: "Run it on your codebase", hint: COMMAND, copy: COMMAND },
	{
		label: "Open on GitHub",
		hint: entry.name,
		href: entry.githubUrl,
		external: true,
	},
	{
		label: "Share this score",
		hint: `${entry.score}/100 as a page you can send`,
		href: entry.shareUrl,
		internal: true,
	},
	{
		label: "Add your project",
		hint: "Open a PR to leaderboard-entries.ts",
		href: CONTRIBUTE_URL,
		external: true,
	},
];

export const LeaderboardScreen = ({
	entries,
}: {
	entries: ResolvedLeaderboardEntry[];
}) => {
	const [selected, setSelected] = useState(0);
	const [menuIndex, setMenuIndex] = useState(0);
	const [focus, setFocus] = useState<"list" | "menu">("list");
	const [offset, setOffset] = useState(0);
	const [toast, setToast] = useState<string | null>(null);
	const frameRef = useRef<HTMLDivElement>(null);
	const listRef = useRef<HTMLDivElement>(null);
	const menuRefs = useRef<(HTMLElement | null)[]>([]);

	const entry = entries[Math.min(selected, entries.length - 1)];
	const items = buildMenuItems(entry);
	const tier = scoreTier(entry.score);
	const birds = getNestBirds(entry.score);
	const labelWidth = Math.max(...items.map((item) => item.label.length));
	const nameWidth = Math.max(...entries.map((row) => row.name.length));

	const handleCopy = useCallback(async (command: string) => {
		try {
			await navigator.clipboard.writeText(command);
			track("command_copied", { command, surface: "leaderboard" });
			setToast(`Copied ${command}`);
			setTimeout(() => setToast(null), COPIED_RESET_MS);
		} catch {
			// Clipboard is unavailable outside a secure context.
		}
	}, []);

	const projectCount = entries.length;
	const menuCount = items.length;
	const overflow = projectCount > LIST_CAPACITY;
	const safeOffset = scrollWindow(
		clampOffset(offset, projectCount, LIST_CAPACITY),
		Math.min(selected, projectCount - 1),
		LIST_CAPACITY
	);
	const visible = entries.slice(safeOffset, safeOffset + LIST_CAPACITY);

	useEffect(() => {
		setOffset(safeOffset);
	}, [safeOffset]);

	useEffect(() => {
		const onKeyDown = (event: globalThis.KeyboardEvent) => {
			if (event.metaKey || event.ctrlKey || event.altKey) {
				return;
			}
			if (isTypingTarget(event.target)) {
				return;
			}
			// Tab traversal is the browser's; onFocus tells the panes who has it.
			const active = document.activeElement;
			if (!isFocusInFrame(active, frameRef.current)) {
				return;
			}

			if (event.key === "ArrowDown" || event.key === "j") {
				event.preventDefault();
				if (focus === "list") {
					setSelected((current) => Math.min(current + 1, projectCount - 1));
				} else {
					const next = (menuIndex + 1) % menuCount;
					setMenuIndex(next);
					menuRefs.current[next]?.focus();
				}
				return;
			}
			if (event.key === "ArrowUp" || event.key === "k") {
				event.preventDefault();
				if (focus === "list") {
					setSelected((current) => Math.max(current - 1, 0));
				} else {
					const next = menuIndex === 0 ? menuCount - 1 : menuIndex - 1;
					setMenuIndex(next);
					menuRefs.current[next]?.focus();
				}
				return;
			}
			// Left and right swap panes, as the TUI does; up and down move inside one.
			if (
				event.key === "ArrowRight" ||
				event.key === "ArrowLeft" ||
				event.key === "l" ||
				event.key === "h"
			) {
				event.preventDefault();
				if (focus === "list") {
					setFocus("menu");
					menuRefs.current[menuIndex]?.focus();
				} else {
					setFocus("list");
					listRef.current?.focus();
				}
				return;
			}
			if (event.key === "Enter") {
				const onMenuRow = menuRefs.current.some((node) => node === active);
				if (!onMenuRow && isInteractiveTarget(active)) {
					return;
				}
				const row = menuRefs.current[menuIndex];
				if (row) {
					event.preventDefault();
					row.click();
				}
			}
		};

		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [focus, projectCount, menuCount, menuIndex]);

	return (
		<div className={FRAME_CLASS} ref={frameRef} style={{ color: palette.text }}>
			<div className="flex flex-row gap-4">
				<pre
					className="m-0 leading-tight"
					style={{ color: scoreColor(entry.score) }}
				>
					{`┌───────┐\n│ ${birds[0]} │\n│ ${birds[1]} │\n└───────┘`}
				</pre>
				<div className="flex flex-col justify-center">
					<div className="font-bold" style={{ color: palette.bright }}>
						{"NESTJS DOCTOR "}
						<span style={{ color: palette.dim }}>{`v${SCANNED_WITH}`}</span>
					</div>
					<div style={{ color: palette.muted }}>
						{`leaderboard · ${entries.length} projects · scanned ${SCANNED_AT} · nestjs-doctor ${SCANNED_WITH}`}
					</div>
				</div>
			</div>

			<div>
				<div className="font-bold">
					<span style={{ color: scoreColor(entry.score) }}>
						{`${entry.score}/${PERFECT_SCORE} ${tier.stars}`}
					</span>
					<span
						className="whitespace-pre"
						style={{ color: palette.muted }}
					>{`  ${tier.label}`}</span>
				</div>
				<ScoreBar score={entry.score} />
				<div className="flex flex-wrap items-baseline">
					<span style={{ color: palette.error }}>
						{`✗ ${countLabel(entry.errorCount, "error")}`}
					</span>
					<Separator />
					<span style={{ color: palette.warning }}>
						{`⚠ ${countLabel(entry.warningCount, "warning")}`}
					</span>
					{entry.infoCount ? (
						<>
							<Separator />
							<span style={{ color: palette.info }}>
								{`● ${entry.infoCount} info`}
							</span>
						</>
					) : null}
					<Separator />
					<span style={{ color: palette.dim }}>
						{`${entry.fileCount} files`}
					</span>
					{entry.moduleCount ? (
						<>
							<Separator />
							<span style={{ color: palette.dim }}>
								{`${entry.moduleCount} modules`}
							</span>
						</>
					) : null}
				</div>
			</div>

			<div className="grid gap-4 sm:grid-cols-[max-content_1fr]">
				<div className={LIST_CLASS}>
					<div
						className={PANEL_LABEL_CLASS}
						style={{
							color: focus === "list" ? palette.bright : palette.muted,
						}}
					>
						{" PROJECTS"}
					</div>
					<div
						aria-activedescendant={optionId(selected)}
						aria-label="Projects"
						className={LISTBOX_CLASS}
						onFocus={() => setFocus("list")}
						ref={listRef}
						role="listbox"
						tabIndex={0}
					>
						{visible.map((row, position) => {
							const index = safeOffset + position;
							const active = index === selected;
							return (
								<button
									aria-selected={active}
									className={ROW_CLASS}
									id={optionId(index)}
									key={row.name}
									onClick={() => {
										setSelected(index);
										setFocus("list");
										listRef.current?.focus();
									}}
									role="option"
									style={{
										backgroundColor: active ? palette.washRed : undefined,
									}}
									tabIndex={-1}
									type="button"
								>
									<span
										className="w-[3px] self-stretch"
										style={{
											backgroundColor: active ? palette.nestRed : "transparent",
										}}
									/>
									<span
										style={{
											color: active ? palette.bright : palette.text,
											fontWeight: active ? 700 : 400,
											minWidth: `${nameWidth}ch`,
										}}
									>
										{row.name}
									</span>
									<span
										className="text-right"
										style={{
											color: active ? palette.bright : scoreColor(row.score),
											minWidth: "7ch",
										}}
									>
										{`${row.score}/${PERFECT_SCORE}`}
									</span>
									<span style={{ color: palette.dim }}>
										{rankMark(row.score)}
									</span>
								</button>
							);
						})}
					</div>
					{overflow ? (
						<div style={{ color: palette.dim }}>
							{` … ${safeOffset + 1}–${Math.min(safeOffset + LIST_CAPACITY, projectCount)} of ${projectCount}`}
						</div>
					) : null}
				</div>

				<div
					aria-live="polite"
					className="flex flex-col sm:border-l sm:pl-4"
					style={{ borderColor: palette.border }}
				>
					<div>
						<span className="font-bold" style={{ color: palette.bright }}>
							{entry.name}
						</span>
						<span
							className="whitespace-pre"
							style={{ color: scoreColor(entry.score) }}
						>
							{`  ${entry.score}/${PERFECT_SCORE}`}
						</span>
					</div>
					<div style={{ color: palette.muted }}>{originLine(entry)}</div>
					<div className="flex flex-wrap items-baseline">
						<span
							style={{ color: palette.error }}
						>{`✗ ${entry.errorCount}`}</span>
						<Separator />
						<span style={{ color: palette.warning }}>
							{`⚠ ${entry.warningCount}`}
						</span>
						{entry.infoCount ? (
							<>
								<Separator />
								<span style={{ color: palette.dim }}>
									{`${entry.infoCount} info`}
								</span>
							</>
						) : null}
						<Separator />
						<span style={{ color: palette.dim }}>
							{`${entry.fileCount} files`}
						</span>
					</div>
					{entry.topRules?.length ? (
						<div className="mt-2 flex flex-col">
							<div
								className={PANEL_LABEL_CLASS}
								style={{ color: palette.muted }}
							>
								{" TOP RULES"}
							</div>
							{entry.topRules.map((rule) => (
								<div className="flex items-baseline gap-2" key={rule.rule}>
									<span style={{ color: severityColor(rule.severity) }}>
										{` ${SEVERITY_MARK[rule.severity]}`}
									</span>
									<span style={{ color: palette.text }}>
										{shortRule(rule.rule)}
									</span>
									<span style={{ color: palette.dim }}>{rule.count}</span>
								</div>
							))}
						</div>
					) : null}
				</div>
			</div>

			<div
				className={focus === "menu" ? MENU_CLASS : MENU_LIST_CLASS}
				style={focus === "menu" ? { borderColor: palette.nestRed } : undefined}
			>
				{items.map((item, index) => {
					const active = index === menuIndex;
					const rowStyle = {
						backgroundColor: active ? palette.washRed : undefined,
					};
					const labelStyle = {
						color: active ? palette.bright : palette.text,
						fontWeight: active ? 700 : 400,
						minWidth: `${labelWidth}ch`,
					};
					const body = (
						<>
							<span
								className="w-[3px] self-stretch"
								style={{
									backgroundColor: active ? palette.nestRed : "transparent",
								}}
							/>
							<span style={labelStyle}>{item.label}</span>
							<span style={{ color: active ? palette.muted : palette.dim }}>
								{item.hint}
							</span>
						</>
					);

					if (item.internal && item.href) {
						return (
							<Link
								className={MENU_ROW_CLASS}
								href={item.href}
								key={item.label}
								onFocus={() => {
									setMenuIndex(index);
									setFocus("menu");
								}}
								onMouseEnter={() => setMenuIndex(index)}
								ref={(node) => {
									menuRefs.current[index] = node;
								}}
								style={rowStyle}
							>
								{body}
							</Link>
						);
					}

					if (item.href) {
						return (
							<a
								className={MENU_ROW_CLASS}
								href={item.href}
								key={item.label}
								onFocus={() => {
									setMenuIndex(index);
									setFocus("menu");
								}}
								onMouseEnter={() => setMenuIndex(index)}
								ref={(node) => {
									menuRefs.current[index] = node;
								}}
								rel="noreferrer"
								style={rowStyle}
								target="_blank"
							>
								{body}
							</a>
						);
					}

					return (
						<button
							className={MENU_ROW_CLASS}
							key={item.label}
							onClick={() => item.copy && handleCopy(item.copy)}
							onFocus={() => {
								setMenuIndex(index);
								setFocus("menu");
							}}
							onMouseEnter={() => setMenuIndex(index)}
							ref={(node) => {
								menuRefs.current[index] = node;
							}}
							style={rowStyle}
							type="button"
						>
							{body}
						</button>
					);
				})}
			</div>

			<div className="flex flex-col">
				{toast ? (
					<div style={{ color: palette.success }}>{`✓ ${toast}`}</div>
				) : null}
				<div style={{ color: palette.dim }}>
					{`nestjs-doctor ${SCANNED_WITH} scanned each repo at one pinned commit on ${SCANNED_AT}, with no dependencies installed.`}
				</div>
				<div style={{ color: palette.dim }}>
					↑↓ move · ←→ switch pane · enter open
				</div>
			</div>
		</div>
	);
};
